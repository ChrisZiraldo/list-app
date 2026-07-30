import { ListsRepository } from './repository.js';

const repository = new ListsRepository(':memory:');
console.log(JSON.stringify({ schema: 'initialized', lists: repository.listLists().length }));
