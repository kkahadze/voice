import {env} from 'cloudflare:workers';
import {handleLearning} from '../../../server/learning-storage.js';
const handler = (request: Request) => handleLearning(request,env);
export {handler as GET, handler as POST};
