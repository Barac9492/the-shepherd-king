import {createDownfallHandler} from '../../server/downfall-ranking-http.mjs';
export default {fetch:createDownfallHandler('attempts')};
