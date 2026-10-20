import { z } from 'zod';

export const joinSchema = z.object({
  sessionCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,8}$/, 'Código da sala inválido'),
  fullName: z.string().trim().min(3, 'Informe o nome completo').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(160),
  employeeNumber: z.string().trim().max(30).optional().or(z.literal('')),
  department: z.string().trim().min(2, 'Informe a área ou setor').max(80),
  unitName: z.string().trim().min(2, 'Informe a unidade').max(80),
  acceptedPrivacy: z.literal(true, { errorMap: () => ({ message: 'É necessário aceitar o aviso de uso dos dados' }) }),
});
export type JoinInput = z.infer<typeof joinSchema>;

export const submitAnswerSchema = z.object({
  roundId: z.string().uuid(),
  optionId: z.string().uuid(),
  clientRequestId: z.string().uuid(), // gerado no cliente; garante idempotência no clique duplo
});
