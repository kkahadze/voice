import { env } from 'cloudflare:workers';
import { handleConnection } from '../../../server/api-connection.js';

const handler = (request: Request) => handleConnection(request, env);
export { handler as GET, handler as POST, handler as DELETE };
