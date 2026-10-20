'use server';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServer } from '@/lib/supabase/server';
import { joinSchema } from '@/lib/validation/participant';

export type JoinResult = { ok: true; code: string } | { ok: false; error: string; field?: string };

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const tokenCookie = (code: string) => `dq_rt_${code}`;

/** Cadastro do participante. Roda no servidor com a secret key; antes valida o usuário anônimo logado. */
export async function joinSession(raw: unknown, deviceId: string): Promise<JoinResult> {
  const parsed = joinSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? 'Dados inválidos', field: String(issue?.path[0] ?? '') };
  }
  const input = parsed.data;
  if (!/^[0-9a-f-]{16,64}$/i.test(deviceId)) return { ok: false, error: 'Dispositivo não identificado. Recarregue a página.' };

  const { data: auth } = await createSupabaseServer().auth.getUser();
  if (!auth.user) return { ok: false, error: 'Sessão não iniciada. Recarregue a página e tente de novo.' };

  const admin = createSupabaseAdmin();
  const { data: session } = await admin.from('game_sessions').select('id,status,registration_open').eq('session_code', input.sessionCode).maybeSingle();
  if (!session) return { ok: false, error: 'Sala não encontrada. Confira o código.', field: 'sessionCode' };

  // Reentrada do mesmo usuário (ex.: recarregou a página): idempotente, não é duplicidade.
  const { data: mine } = await admin.from('participants').select('id').eq('session_id', session.id).eq('auth_user_id', auth.user.id).maybeSingle();
  if (mine) return { ok: true, code: input.sessionCode };

  // Reconexão liberada pelo apresentador (ex.: trocou de aparelho): mesmo e-mail reassume o cadastro, uma única vez.
  const { data: released } = await admin.from('participants').select('id').eq('session_id', session.id).eq('email', input.email).eq('reconnect_released', true).eq('is_disqualified', false).maybeSingle();
  if (released) {
    const t = randomBytes(32).toString('base64url');
    const { error: re } = await admin.from('participants').update({
      auth_user_id: auth.user.id, reconnect_token_hash: sha256(t), device_hash: sha256(`${deviceId}:${session.id}`), reconnect_released: false, last_seen_at: new Date().toISOString(),
    }).eq('id', released.id);
    if (re) return { ok: false, error: 'Não foi possível reconectar. Fale com o apresentador.' };
    cookies().set(tokenCookie(input.sessionCode), t, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 48 });
    return { ok: true, code: input.sessionCode };
  }

  if (!session.registration_open) return { ok: false, error: 'As inscrições desta sala estão fechadas.' };

  const token = randomBytes(32).toString('base64url');
  const { error } = await admin.from('participants').insert({
    session_id: session.id, auth_user_id: auth.user.id, full_name: input.fullName, email: input.email,
    employee_number: input.employeeNumber || null, department: input.department, unit_name: input.unitName,
    reconnect_token_hash: sha256(token), device_hash: sha256(`${deviceId}:${session.id}`),
  });
  if (error) {
    if (error.code === '23505') {
      if (error.message.includes('email')) return { ok: false, error: 'Este e-mail já está cadastrado nesta sala.', field: 'email' };
      if (error.message.includes('name')) return { ok: false, error: 'Já existe um participante com este nome na sala.', field: 'fullName' };
      return { ok: false, error: 'Este dispositivo já está cadastrado nesta sala.' };
    }
    console.error('[join] falha ao inserir participante', error.code);
    return { ok: false, error: 'Não foi possível concluir o cadastro. Tente novamente.' };
  }

  cookies().set(tokenCookie(input.sessionCode), token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 48,
  });
  return { ok: true, code: input.sessionCode };
}

/** Reconexão: o usuário anônimo mudou (limpou cookies), mas o token httpOnly prova que o dispositivo é o mesmo participante. */
export async function reconnectSession(code: string): Promise<{ ok: boolean }> {
  const c = code.trim().toUpperCase();
  const token = cookies().get(tokenCookie(c))?.value;
  if (!token) return { ok: false };
  const { data: auth } = await createSupabaseServer().auth.getUser();
  if (!auth.user) return { ok: false };

  const admin = createSupabaseAdmin();
  const { data: session } = await admin.from('game_sessions').select('id,allow_reconnection').eq('session_code', c).maybeSingle();
  if (!session?.allow_reconnection) return { ok: false };
  const { data: p } = await admin.from('participants').select('id,is_disqualified')
    .eq('session_id', session.id).eq('reconnect_token_hash', sha256(token)).maybeSingle();
  if (!p || p.is_disqualified) return { ok: false };
  const { error } = await admin.from('participants').update({ auth_user_id: auth.user.id, last_seen_at: new Date().toISOString() }).eq('id', p.id);
  return { ok: !error };
}
