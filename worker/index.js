import { getAccessIdentity } from './access.js'
import { normalizeInvitationCode } from './guest-security.js'
import { prepareRsvpChanges } from './rsvp.js'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (url.pathname === '/admin' || url.pathname === '/admin/') return handleAdminPage(request, env, ctx)
    if (url.pathname.startsWith('/admin/api/')) return handleAdminApi(request, env, ctx)
    if (url.pathname === '/api/health') return Response.json({ ok:true, service:'margo-glenn-wedding-api' })
    if (url.pathname === '/api/invitation') return handleInvitation(request, env)
    if (url.pathname === '/api/rsvp') return handleRsvp(request, env)
    return env.ASSETS.fetch(request)
  }
}

async function handleAdminPage(request, env, ctx) {
  if (!await getAccessIdentity(request, env, ctx)) return new Response('Unauthorized',{status:401})
  return env.ASSETS.fetch(new Request(new URL('/admin.html',request.url),request))
}

async function handleAdminApi(request, env, ctx) {
  const identity = await getAccessIdentity(request, env, ctx)
  if (!identity) return Response.json({ok:false,error:'Unauthorized'},{status:401})
  const url = new URL(request.url)
  if (url.pathname === '/admin/api/health' && request.method === 'GET') return Response.json({ok:true,authenticated:true,email:identity.email??null})
  if (url.pathname === '/admin/api/dashboard' && request.method === 'GET') return handleAdminDashboard(env,identity)
  if (url.pathname === '/admin/api/invitation/toggle' && request.method === 'POST') return handleAdminInvitationToggle(request,env,identity)
  return Response.json({ok:false,error:'Not found'},{status:404})
}

async function handleAdminDashboard(env, identity) {
  try {
    const db = env.margo_glenn_wedding_db
    const invitationResult = await db.prepare(`SELECT id, invitation_code, active FROM invitations ORDER BY id`).all()
    const guestResult = await db.prepare(`SELECT id, invitation_id, name, email, invited_to_dinner, invited_to_evening, rsvp_status, dinner_rsvp_status, evening_rsvp_status FROM guests ORDER BY invitation_id,id`).all()
    const dietaryResult = await db.prepare(`SELECT id,guest_id,event_part,category,other_type,other_text FROM guest_dietary_requirements ORDER BY guest_id,event_part,id`).all()
    // rsvp_responses uses submitted_at in the actual schema; expose it to the
    // admin UI as createdAt for a consistent frontend representation.
    const rsvpResult = await db.prepare(`SELECT id,guest_id,status,event_part,submitted_at AS created_at FROM rsvp_responses ORDER BY submitted_at DESC`).all()

    const invitations = invitationResult.results.map(invitation => {
      const guests = guestResult.results.filter(g => g.invitation_id === invitation.id).map(guest => {
        const seen = new Set()
        const dietaryRequirements = dietaryResult.results.filter(r => r.guest_id === guest.id).filter(r => {
          if (seen.has(r.category)) return false
          seen.add(r.category)
          return true
        }).map(r => ({id:r.id,category:r.category,otherText:r.other_text}))
        const rsvpHistory = rsvpResult.results.filter(r => r.guest_id === guest.id).map(r => ({id:r.id,status:r.status,eventPart:r.event_part,createdAt:r.created_at}))
        return {
          id:guest.id,name:guest.name,email:guest.email||null,
          invitedToDinner:guest.invited_to_dinner===1,
          invitedToEvening:guest.invited_to_evening===1,
          rsvpStatus:guest.rsvp_status,
          dinnerRsvpStatus:guest.dinner_rsvp_status,
          eveningRsvpStatus:guest.evening_rsvp_status,
          dietaryRequirements,rsvpHistory
        }
      })
      return {id:invitation.id,invitationCode:invitation.invitation_code,active:invitation.active===1,guests}
    })

    const allGuests = guestResult.results
    const summary = {
      invitations:invitations.length,
      activeInvitations:invitations.filter(i=>i.active).length,
      guests:allGuests.length,
      dinnerAttending:allGuests.filter(g=>g.dinner_rsvp_status==='attending').length,
      dinnerDeclined:allGuests.filter(g=>g.dinner_rsvp_status==='declined').length,
      eveningAttending:allGuests.filter(g=>g.evening_rsvp_status==='attending').length,
      eveningDeclined:allGuests.filter(g=>g.evening_rsvp_status==='declined').length
    }
    return Response.json({ok:true,admin:{email:identity.email??null},summary,invitations})
  } catch (error) {
    console.error('Admin dashboard failed:',error)
    return Response.json({ok:false,error:'Unable to load admin dashboard'},{status:500})
  }
}

async function handleAdminInvitationToggle(request, env, identity) {
  let body
  try { body=await request.json() } catch { return Response.json({ok:false,error:'Invalid JSON'},{status:400}) }
  const id=Number(body?.id), active=body?.active
  if (!Number.isInteger(id) || typeof active!=='boolean') return Response.json({ok:false,error:'Invalid invitation data'},{status:400})
  try {
    const result=await env.margo_glenn_wedding_db.prepare(`UPDATE invitations SET active=? WHERE id=?`).bind(active?1:0,id).run()
    if (result.meta.changes===0) return Response.json({ok:false,error:'Invitation not found'},{status:404})
    console.log(`Invitation ${id} set to ${active?'active':'inactive'} by ${identity.email??'unknown'}`)
    return Response.json({ok:true})
  } catch (error) {
    console.error('Invitation toggle failed:',error)
    return Response.json({ok:false,error:'Unable to update invitation'},{status:500})
  }
}

async function handleInvitation(request, env) {
  if (request.method!=='GET') return Response.json({ok:false,error:'Method not allowed'},{status:405,headers:{Allow:'GET'}})
  const rawCode=new URL(request.url).searchParams.get('code')
  const code=normalizeInvitationCode(rawCode, env)
  if (!code) return Response.json({ok:false,error:'Invalid invitation'},{status:404})
  try {
    const db=env.margo_glenn_wedding_db
    const invitation=await db.prepare(`SELECT id,active FROM invitations WHERE invitation_code=? LIMIT 1`).bind(code).first()
    if (!invitation || invitation.active!==1) return Response.json({ok:false,error:'Invalid invitation'},{status:404})
    const result=await db.prepare(`SELECT id,name,email,invited_to_dinner,invited_to_evening,rsvp_status,dinner_rsvp_status,evening_rsvp_status FROM guests WHERE invitation_id=? ORDER BY id`).bind(invitation.id).all()
    const dietaryResult=await db.prepare(`SELECT id,guest_id,event_part,category,other_type,other_text FROM guest_dietary_requirements WHERE guest_id IN (SELECT id FROM guests WHERE invitation_id=?) ORDER BY guest_id,event_part,id`).bind(invitation.id).all()
    const guests=result.results.map(guest=>{
      const seen=new Set()
      const dietaryRequirements=dietaryResult.results.filter(r=>r.guest_id===guest.id).filter(r=>{if(seen.has(r.category))return false;seen.add(r.category);return true}).map(r=>({id:r.id,category:r.category,otherText:r.other_text}))
      return {id:guest.id,name:guest.name,invitedToDinner:guest.invited_to_dinner===1,invitedToEvening:guest.invited_to_evening===1,rsvpStatus:guest.rsvp_status,dinnerRsvpStatus:guest.dinner_rsvp_status,eveningRsvpStatus:guest.evening_rsvp_status,dietaryRequirements}
    })
    const email=result.results.find(g=>g.email)?.email||''
    return Response.json({ok:true,email,guests})
  } catch (error) {
    console.error('Invitation lookup failed:',error)
    return Response.json({ok:false,error:'Unable to process invitation'},{status:500})
  }
}

async function handleRsvp(request, env) {
  if (request.method !== 'POST') return Response.json({ok:false,error:'Method not allowed'}, {status:405,headers:{Allow:'POST'}})
  let body
  try { body = await request.json() } catch { return Response.json({ok:false,error:'Invalid JSON'}, {status:400}) }
  const code = normalizeInvitationCode(body?.code, env)
  if (!code) return Response.json({ok:false,error:'Invalid invitation'}, {status:404})
  try {
    const db = env.margo_glenn_wedding_db
    const invitation = await db.prepare('SELECT id,active FROM invitations WHERE invitation_code=? LIMIT 1').bind(code).first()
    if (!invitation || invitation.active !== 1) return Response.json({ok:false,error:'Invalid invitation'}, {status:404})
    const { statements } = await prepareRsvpChanges(db, invitation.id, body)
    await db.batch(statements)
    return Response.json({ok:true})
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status === 500) console.error('RSVP submission failed:', error)
    return Response.json({ok:false,error:status === 500 ? 'Unable to save RSVP' : error.message}, {status})
  }
}
