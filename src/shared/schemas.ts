import { z } from 'zod';

/**
 * zod schemas for every type in types.ts that crosses an IPC boundary.
 * Validated on both sides per tech.md section 6 / 10.4.
 */

export const protocolIdSchema = z.union([z.literal('vless-reality'), z.literal('hysteria2')]);

export const distroIdSchema = z.union([z.literal('debian'), z.literal('ubuntu')]);

export const serverCredentialsSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).regex(/^\S+$/),
  password: z.string().min(1),
});

export const tlsModeSchema = z.union([z.literal('self-signed'), z.literal('acme-domain')]);

export const deployParamsSchema = z
  .object({
    distroHint: z.union([distroIdSchema, z.literal('auto')]),
    tlsMode: tlsModeSchema,
    domain: z.string().min(1).optional(),
    acmeEmail: z.string().email().optional(),
  })
  .refine((v) => v.tlsMode !== 'acme-domain' || (!!v.domain && !!v.acmeEmail), {
    message: 'domain and acmeEmail are required when tlsMode is acme-domain',
  });

export const checkRequestSchema = z.object({
  credentials: serverCredentialsSchema,
  params: deployParamsSchema,
});

export const installModeSchema = z.union([z.literal('install'), z.literal('reinstall')]);

export const installRequestSchema = z.object({
  sessionId: z.string().min(1),
  protocols: z.array(protocolIdSchema).min(1),
  mode: installModeSchema,
  params: deployParamsSchema,
});

export const removeRequestSchema = z.object({
  sessionId: z.string().min(1),
  protocols: z.array(protocolIdSchema).min(1),
});

export const installCancelRequestSchema = z.object({
  runId: z.string().min(1),
});

export const sessionCloseRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const hostkeyConfirmRequestSchema = z.object({
  promptId: z.string().min(1),
  accepted: z.boolean(),
});

export type HostkeyConfirmRequest = z.infer<typeof hostkeyConfirmRequestSchema>;

/** Named shape for the hostkey:prompt send-channel payload (tech.md section 6). */
export const hostKeyPromptEventSchema = z.object({
  promptId: z.string().min(1),
  host: z.string().min(1),
  fingerprint: z.string().min(1),
  known: z.boolean(),
});

export type HostKeyPromptEvent = z.infer<typeof hostKeyPromptEventSchema>;

/** Stage 0 skeleton demo channel payload. */
export const demoPingRequestSchema = z.object({
  message: z.string().min(1).max(200),
});

export const demoPingResponseSchema = z.object({
  echo: z.string(),
  receivedAt: z.number(),
});

export type DemoPingRequest = z.infer<typeof demoPingRequestSchema>;
export type DemoPingResponse = z.infer<typeof demoPingResponseSchema>;
