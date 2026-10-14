import {randomBytes} from 'node:crypto';
export class Sessions {
 constructor({ttlMs=30*60*1000,limit=1000}={}){this.entries=new Map();this.ttlMs=ttlMs;this.limit=limit;}
 prune(){for(const [id,s] of this.entries)if(s.expires<=Date.now())this.remove(id);}
 add(client){this.prune();if(this.entries.size>=this.limit)throw new Error('SESSION_LIMIT');const id=randomBytes(32).toString('hex');const timer=setTimeout(()=>this.remove(id),this.ttlMs);timer.unref();this.entries.set(id,{client,expires:Date.now()+this.ttlMs,busy:false,timer});return id;}
 get(id){this.prune();return this.entries.get(id);}
 remove(id){const s=this.entries.get(id);if(s){clearTimeout(s.timer);s.client.close();this.entries.delete(id);}}
 close(){for(const id of this.entries.keys())this.remove(id);}
}
