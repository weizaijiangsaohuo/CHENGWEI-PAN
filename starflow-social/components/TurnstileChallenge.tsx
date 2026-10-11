'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

type Turnstile = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  }) => string;
  remove: (widgetId: string) => void;
};

export function TurnstileChallenge({siteKey,onToken,onError}: {
  siteKey: string;
  onToken: (token: string) => void;
  onError: () => void;
}) {
  const container=useRef<HTMLDivElement>(null);
  const callbacks=useRef({onToken,onError});
  callbacks.current={onToken,onError};
  const [ready,setReady]=useState(false);

  useEffect(()=>{
    const turnstile=(window as Window & {turnstile?: Turnstile}).turnstile;
    if(!ready||!container.current||!turnstile)return;
    let active=true;
    const widgetId=turnstile.render(container.current,{
      sitekey:siteKey,
      callback:token=>{if(active)callbacks.current.onToken(token);},
      'expired-callback':()=>{if(active)callbacks.current.onToken('');},
      'error-callback':()=>{
        if(active){callbacks.current.onToken('');callbacks.current.onError();}
      }
    });
    return()=>{active=false;turnstile.remove(widgetId);};
  },[ready,siteKey]);

  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      onReady={()=>setReady(true)}
      onError={()=>{onToken('');onError();}}/>
    <div ref={container} className="captcha-container"/>
  </>;
}
