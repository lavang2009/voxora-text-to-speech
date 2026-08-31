export type Voice = {
  id:string; name:string; language:string; locale:string; gender:"Male"|"Female"|"Neutral";
  provider:string; type:string; friendlyName?:string; isPopular?:boolean;
};
export type Preferences = {
  defaultLanguage:string; defaultVoice:string; defaultSpeed:number; defaultPitch:number;
  defaultVolume:number; defaultFormat:"mp3"|"wav"; theme:"light"|"dark"|"system";
};
export type AppUser = {uid:string;displayName:string;email:string;photoURL?:string;provider?:string;plan?:string};
export type HistoryItem = {id:string;textPreview:string;voiceId:string;voiceName:string;language:string;audioUrl?:string;format:string;duration?:number;createdAt:string};
