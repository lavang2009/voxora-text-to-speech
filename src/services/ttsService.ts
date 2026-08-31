import axios from "axios";
const API=import.meta.env.VITE_API_BASE_URL||"http://localhost:5000/api";
export const listVoices=async()=> (await axios.get(`${API}/voices`)).data.data;
export const generateSpeech=async(payload:any,getToken:()=>Promise<string>)=>{const token=await getToken();const r=await axios.post(`${API}/tts/generate`,payload,{responseType:"blob",headers:{Authorization:`Bearer ${token}`}});return{url:URL.createObjectURL(r.data),blob:r.data as Blob,audioUrl:r.headers["x-audio-url"] as string|undefined,duration:Number(r.headers["x-audio-duration"]||0)}};
export const uploadAvatar=async(file:File,getToken:()=>Promise<string>)=>{const token=await getToken();const f=new FormData();f.append("file",file);return (await axios.post(`${API}/upload/avatar`,f,{headers:{Authorization:`Bearer ${token}`}})).data.data};
