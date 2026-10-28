import {env} from 'cloudflare:workers';
import {handleJourney} from '../../../server/journey.js';
export const GET=(request:Request)=>handleJourney(request,env);
export const POST=(request:Request)=>handleJourney(request,env);
