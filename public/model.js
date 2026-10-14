export class AccountModel {
 constructor(){this.version=0;this.connected=false;this.data=null;this.selected=null;}
 reset(connected){this.version++;this.connected=connected;this.data=null;this.selected=null;}
 accept(version,data){if(version!==this.version)return false;this.data=data;return true;}
}
