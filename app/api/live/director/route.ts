import { env } from 'cloudflare:workers';
import { handleDirector } from '../../../../server/lesson-director.js';
export const POST = (request: Request) => handleDirector(request, env);
