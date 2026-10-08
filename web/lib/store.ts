"use client";
import {create} from "zustand";
type Mode="light"|"dark";
type State={mode:Mode;token:string;language:string;queue:number;setMode:(mode:Mode)=>void;setToken:(token:string)=>void;setLanguage:(language:string)=>void;addQueue:()=>void};
export const useUiStore=create<State>((set)=>({mode:"light",token:"",language:"en",queue:0,setMode:(mode)=>{document.documentElement.classList.toggle("dark",mode==="dark");set({mode})},setToken:(token)=>set({token}),setLanguage:(language)=>set({language}),addQueue:()=>set(s=>({queue:s.queue+1}))}));