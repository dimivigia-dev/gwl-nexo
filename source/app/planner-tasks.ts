/* Task authorization is enforced here for every reader and mutation. */
type Row = Record<string, any>;
type User = {email:string;name:string;profile:Row};
export function plannerRole(profile:Row){
  if(profile.role==='Administrador')return 'administrador';
  return ['administrador','gerente'].includes(profile.planner_role)?profile.planner_role:'colaborador';
}
export const mayDelegate=(user:User)=>['administrador','gerente'].includes(plannerRole(user.profile));
export async function visibleTasks(db:any,email:string){
  return db.prepare("SELECT * FROM planner_tasks WHERE visibility='public' OR (visibility='assigned' AND assignee_email=?) OR (visibility='personal' AND owner_email=?) ORDER BY CASE status WHEN 'concluida' THEN 1 ELSE 0 END,due_date,due_time,id DESC").bind(email,email).all();
}
const bad=(message:string,status=400)=>Response.json({error:message},{status});
const text=(v:unknown,n=4000)=>String(v||'').trim().slice(0,n);
export async function taskAction(db:any,user:User,body:Row):Promise<Response>{
  const action=body.action;
  if(action==='planner.role.update'){
    if(plannerRole(user.profile)!=='administrador')return bad('Somente administradores podem alterar perfis.',403);
    const email=text(body.email,180).toLowerCase(),role=text(body.role,30);
    if(!['administrador','gerente','colaborador'].includes(role))return bad('Perfil inválido.');
    const target=await db.prepare("SELECT email,role FROM ponto_access_profiles WHERE lower(email)=? AND status='active'").bind(email).first();
    if(!target)return bad('Usuário ativo não encontrado.',404);
    if(target.role==='Administrador')return bad('O administrador principal mantém o acesso administrativo.',409);
    if(email===user.email)return bad('Você não pode alterar o próprio perfil.',409);
    await db.prepare('UPDATE ponto_access_profiles SET planner_role=?,updated_at=CURRENT_TIMESTAMP WHERE lower(email)=?').bind(role,email).run();
    return Response.json({ok:true});
  }
  if(action==='task.create'||action==='task.update'){
    const existing=action==='task.update'?await db.prepare('SELECT * FROM planner_tasks WHERE id=?').bind(Number(body.id)).first():null;
    if(action==='task.update'&&(!existing||existing.owner_email!==user.email||existing.visibility==='assigned'||(existing.visibility==='public'&&!mayDelegate(user))))return bad('Você não pode editar esta tarefa.',403);
    const visibility=existing?.visibility||text(body.visibility,20)||'personal';
    if(!['personal','assigned','public'].includes(visibility))return bad('Visibilidade inválida.');
    if(visibility!=='personal'&&!mayDelegate(user))return bad('Somente administradores e gerentes podem delegar tarefas.',403);
    const title=text(body.title,220),dueDate=text(body.dueDate,10),dueTime=text(body.dueTime,5),priority=text(body.priority,20)||'media';
    if(!title)return bad('Informe o título da tarefa.');
    if(!['baixa','media','alta','urgente'].includes(priority))return bad('Urgência inválida.');
    if((visibility!=='personal'&&!dueDate)||(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))||(dueDate&&(!Number.isFinite(Date.parse(dueDate+'T12:00:00Z'))||new Date(dueDate+'T12:00:00Z').toISOString().slice(0,10)!==dueDate)))return bad('Informe uma data válida para o prazo.');
    if(dueTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime))return bad('Horário inválido.');
    const minutes=Number(body.estimatedMinutes||0);if(!Number.isInteger(minutes)||minutes<0||minutes>100800)return bad('Informe uma duração estimada válida em minutos.');
    let assigneeEmail='',assigneeName='';
    if(visibility==='assigned'){
      assigneeEmail=text(body.assigneeEmail,180).toLowerCase();
      const person=await db.prepare("SELECT email,name FROM ponto_access_profiles WHERE lower(email)=? AND status='active'").bind(assigneeEmail).first();
      if(!person)return bad('Selecione um usuário cadastrado e ativo.');
      assigneeName=person.name||person.email;
    }
    if(existing){
      await db.prepare('UPDATE planner_tasks SET title=?,notes=?,due_date=?,due_time=?,priority=?,estimated_minutes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_email=?').bind(title,text(body.notes),dueDate,dueTime,priority,minutes,existing.id,user.email).run();
      return Response.json({ok:true});
    }
    const result=await db.prepare('INSERT INTO planner_tasks (owner_email,creator_name,title,notes,due_date,due_time,priority,estimated_minutes,visibility,assignee_email,assignee_name) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(user.email,user.name,title,text(body.notes),dueDate,dueTime,priority,minutes,visibility,assigneeEmail,assigneeName).run();
    return Response.json({ok:true,id:result.meta?.last_row_id});
  }
  if(action==='task.claim'){
    const won=await db.prepare("UPDATE planner_tasks SET assignee_email=?,assignee_name=?,claimed_at=CURRENT_TIMESTAMP,status='em_andamento',updated_at=CURRENT_TIMESTAMP WHERE id=? AND visibility='public' AND assignee_email='' AND status='pendente' RETURNING id").bind(user.email,user.name,Number(body.id)).first();
    if(!won)return bad('Esta tarefa já foi assumida ou não está disponível. Atualize a lista.',409);
    return Response.json({ok:true});
  }
  const task=await db.prepare('SELECT * FROM planner_tasks WHERE id=?').bind(Number(body.id)).first();
  const visible=task&&(task.visibility==='public'||(task.visibility==='assigned'?task.assignee_email===user.email:task.owner_email===user.email));
  if(!visible)return bad('Tarefa não encontrada.',404);
  if(action==='task.delete'){
    if(task.owner_email!==user.email||task.visibility==='assigned'||(task.visibility==='public'&&!mayDelegate(user)))return bad('Você não pode excluir esta tarefa.',403);
    await db.prepare('DELETE FROM planner_tasks WHERE id=? AND owner_email=?').bind(task.id,user.email).run();return Response.json({ok:true});
  }
  const executor=task.visibility==='personal'?task.owner_email:task.assignee_email;
  if(executor!==user.email)return bad('Somente o responsável pode atualizar a execução.',403);
  const next=action==='task.toggle'?(task.status==='concluida'?'pendente':'concluida'):text(body.status,20);
  if(action!=='task.toggle'&&action!=='task.status')return bad('Ação inválida.');
  if(!['pendente','em_andamento','concluida'].includes(next))return bad('Status inválido.');
  const updated=await db.prepare('UPDATE planner_tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=? RETURNING id').bind(next,task.id,task.status).first();
  if(!updated)return bad('A tarefa mudou. Atualize a lista.',409);
  return Response.json({ok:true});
}
