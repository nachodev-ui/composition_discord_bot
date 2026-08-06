import { z } from 'zod';

const optionalText = z.string().trim().min(1).nullable().optional();

export const discordRoleSchema = z.object({
  id: z.union([z.literal(''), z.string().regex(/^\d{17,20}$/)]).default(''),
  name: z.string().trim().min(1).max(100),
});

export const weaponSchema = z.object({
  name: z.string().trim().min(1),
  q: z.string().trim().min(1),
  w: z.string().trim().min(1),
  e: z.string().trim().min(1),
  passive: z.string().trim().min(1),
});

export const armorPieceSchema = z.object({
  name: z.string().trim().min(1),
  ability: optionalText,
  passive: optionalText,
});

export const buildSchema = z.object({
  number: z.number().int().positive().max(999),
  name: z.string().trim().min(1).max(256),
  category: z.string().trim().min(1).max(100),
  enabled: z.boolean().default(true),
  discordRole: discordRoleSchema,
  equipment: z.object({
    weapon: weaponSchema,
    offhand: optionalText,
    head: armorPieceSchema,
    chest: armorPieceSchema,
    shoes: armorPieceSchema,
    cape: z.string().trim().min(1),
  }),
  consumables: z.object({
    potion: z.string().trim().min(1),
    food: z.string().trim().min(1),
  }),
  alternatives: optionalText,
  sourceUrl: z.url().nullable().optional(),
  imagePath: optionalText,
});

export const buildConfigSchema = z
  .object({
    version: z.number().int().positive(),
    description: z.string().trim().min(1),
    builds: z.array(buildSchema).min(1).max(999),
  })
  .superRefine((config, context) => {
    const numbers = new Set<number>();
    const roleIds = new Set<string>();
    const roleNames = new Set<string>();

    config.builds.forEach((build, index) => {
      if (numbers.has(build.number)) {
        context.addIssue({
          code: 'custom',
          path: ['builds', index, 'number'],
          message: `El número ${build.number} está duplicado.`,
        });
      }
      numbers.add(build.number);

      const normalizedName = build.discordRole.name.toLocaleLowerCase('es');
      if (roleNames.has(normalizedName)) {
        context.addIssue({
          code: 'custom',
          path: ['builds', index, 'discordRole', 'name'],
          message: `El nombre de rol ${build.discordRole.name} está duplicado.`,
        });
      }
      roleNames.add(normalizedName);

      if (build.discordRole.id) {
        if (roleIds.has(build.discordRole.id)) {
          context.addIssue({
            code: 'custom',
            path: ['builds', index, 'discordRole', 'id'],
            message: `El ID de rol ${build.discordRole.id} está duplicado.`,
          });
        }
        roleIds.add(build.discordRole.id);
      }
    });
  });

export type AlbionBuild = z.infer<typeof buildSchema>;
export type BuildConfig = z.infer<typeof buildConfigSchema>;
