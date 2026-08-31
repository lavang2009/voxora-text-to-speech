import {create} from "zustand"; import type {AppUser,HistoryItem,Preferences,Voice} from "../types";
const defaults:Preferences={defaultLanguage:"en-US",defaultVoice:"",defaultSpeed:1,defaultPitch:0,defaultVolume:1,defaultFormat:"mp3",theme:"system"};
type State={user:AppUser|null;voices:Voice[];favorites:Record<string,Voice>;history:HistoryItem[];preferences:Preferences;setUser:(x:AppUser|null)=>void;setVoices:(x:Voice[])=>void;setFavorites:(x:Voice[])=>void;setHistory:(x:HistoryItem[])=>void;toggleFavorite:(x:Voice)=>void;setPreferences:(x:Partial<Preferences>)=>void};
export const useAppStore=create<State>((set)=>({user:null,voices:[],favorites:{},history:[],preferences:defaults,
 setUser:user=>set({user}),setVoices:voices=>set({voices}),
 setFavorites:voices=>set({favorites:Object.fromEntries(voices.map(v=>[v.id,v]))}),
 setHistory:history=>set({history}),
 toggleFavorite:v=>set(s=>{const n={...s.favorites};if(n[v.id])delete n[v.id];else n[v.id]=v;return{favorites:n}}),
 setPreferences:p=>set(s=>({preferences:{...s.preferences,...p}}))
}));