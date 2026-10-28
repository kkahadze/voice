import { env } from 'cloudflare:workers';
import { createLiveSession } from '../../../../server/live-session.js';

export const POST = (request: Request) => createLiveSession(request, env);
