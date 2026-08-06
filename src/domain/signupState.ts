import { z } from 'zod';

const snowflakeSchema = z.string().regex(/^\d{17,20}$/);

export const signupAssignmentSchema = z.object({
  buildNumber: z.number().int().positive(),
  userId: snowflakeSchema,
  roleId: snowflakeSchema,
  assignedAt: z.string().min(1),
});

export const signupStateSchema = z.object({
  version: z.literal(1),
  panelMessageId: snowflakeSchema.nullable(),
  assignments: z.record(z.string(), signupAssignmentSchema),
});

export type SignupAssignment = z.infer<typeof signupAssignmentSchema>;
export type SignupState = z.infer<typeof signupStateSchema>;

export function createEmptySignupState(): SignupState {
  return {
    version: 1,
    panelMessageId: null,
    assignments: {},
  };
}
