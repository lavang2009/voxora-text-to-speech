import {clsx,type ClassValue} from "clsx"; import {twMerge} from "tailwind-merge";
export const cn=(...x:ClassValue[])=>twMerge(clsx(x));
export const formatDate=(s:string)=>new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(s));
