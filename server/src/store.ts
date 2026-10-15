import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
export function createStore(url: string, override?: any) {
 const db = override || drizzle(neon(url));
 const run = async (q: any): Promise<any[]> => (await db.execute(q)).rows;
 return {
  async ready() { await run(sql`select users.id from users, learner_profiles, lesson_progress, driving_sessions, driving_faults, ai_feedback limit 0`); },
  async user(clerkId: string) { return (await run(sql`insert into users (clerk_id) values (${clerkId}) on conflict(clerk_id) do update set clerk_id=excluded.clerk_id returning id`))[0].id; },
  async progress(user: string) { return (await run(sql`select data as profile, revision from learner_profiles where user_id=${user}::uuid`))[0] || { profile: null, revision: 0 }; },
  async saveProgress(user: string, input: any) {
   const rows = await run(sql`with saved as (
    insert into learner_profiles(user_id,data,revision) select ${user}::uuid, ${JSON.stringify(input.profile)}::jsonb, 1 where ${input.revision}=0 or exists (select 1 from learner_profiles where user_id=${user}::uuid and revision=${input.revision})
    on conflict(user_id) do update set data=excluded.data, revision=learner_profiles.revision+1, updated_at=now() where learner_profiles.revision=${input.revision}
    returning user_id, revision
   ), removed as (delete from lesson_progress where user_id in (select user_id from saved) and not (${JSON.stringify(input.profile.lessons)}::jsonb ? lesson_id) returning id), written as (
    insert into lesson_progress(user_id,lesson_id,data) select saved.user_id, e.key, e.value from saved cross join jsonb_each(${JSON.stringify(input.profile.lessons)}::jsonb) e
    on conflict(user_id,lesson_id) do update set data=excluded.data returning id
   ) select revision from saved`);
   return rows[0] || null;
  },
  async saveSession(user: string, input: any) {
   const rows = await run(sql`with added as (
    insert into driving_sessions(id,user_id,started_at,duration,kind,data) values (${input.id}::uuid,${user}::uuid,${input.startedAt}::timestamptz,${input.duration},${input.kind},${JSON.stringify(input)}::jsonb)
    on conflict(id) do nothing returning id
   ), f as (
    insert into driving_faults(session_id,position,data) select added.id, (e.ordinality-1)::integer, e.value from added cross join jsonb_array_elements(${JSON.stringify(input.faults)}::jsonb) with ordinality e returning id
   ), a as (
    insert into ai_feedback(session_id,data) select id, ${JSON.stringify(input.feedback || null)}::jsonb from added where ${!!input.feedback} returning id
   ) select id from added`);
   if (rows.length) return { id: input.id, duplicate: false };
   const existing = (await run(sql`select id from driving_sessions where id=${input.id}::uuid and user_id=${user}::uuid and data=${JSON.stringify(input)}::jsonb`))[0];
   return existing ? { id: existing.id, duplicate: true } : null;
  },
  async list(user: string, limit: number, offset: number) { return run(sql`select id,started_at,duration,kind,data from driving_sessions where user_id=${user}::uuid order by started_at desc,id limit ${limit} offset ${offset}`); },
  async session(user: string, id: string) { return (await run(sql`select data from driving_sessions where id=${id}::uuid and user_id=${user}::uuid`))[0]?.data || null; }
 };
}
