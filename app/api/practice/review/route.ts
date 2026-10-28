import { env } from 'cloudflare:workers';
import { reviewPractice } from '../../../../server/practice-review.js';
export const POST = (request: Request) => reviewPractice(request, env);
