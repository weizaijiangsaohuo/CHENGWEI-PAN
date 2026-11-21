// Internal laboratory factory only. No Next.js route imports this module.
import { betterAuth } from 'better-auth';
import { username, twoFactor } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';

export function authOptions({database, origin, secret}) {
  if (!database) throw new Error('Authentication database required');
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Authentication secret required');
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password)
    throw new Error('Exact HTTPS origin required');
  return {
    appName:'Starflow', database, baseURL:origin, basePath:'/api/identity/auth',
    secret, trustedOrigins:[origin],
    emailAndPassword:{
      enabled:true, disableSignUp:true, requireEmailVerification:true, autoSignIn:false,
      minPasswordLength:15, maxPasswordLength:128, revokeSessionsOnPasswordReset:true,
      resetPasswordTokenExpiresIn:900,
      sendResetPassword:async()=>{throw new Error('Mail delivery disabled in lab');}
    },
    emailVerification:{
      autoSignInAfterVerification:false, expiresIn:900,
      sendVerificationEmail:async()=>{throw new Error('Mail delivery disabled in lab');}
    },
    account:{accountLinking:{enabled:false}},
    session:{expiresIn:86400,updateAge:3600,cookieCache:{enabled:false}},
    advanced:{
      useSecureCookies:true, cookiePrefix:'starflow-v2-lab',
      disableCSRFCheck:false,disableOriginCheck:false,
      database:{generateId:'uuid'},
      ipAddress:{ipAddressHeaders:['cf-connecting-ip']}
    },
    rateLimit:{enabled:true,storage:'database',window:60,max:30},
    plugins:[
      username({minUsernameLength:3,maxUsernameLength:24}),
      twoFactor({issuer:'Starflow',skipVerificationOnEnable:false,allowPasswordless:false,
        backupCodeOptions:{storeBackupCodes:'encrypted'}}),
      passkey({rpID:url.hostname,rpName:'Starflow',origin,
        authenticatorSelection:{residentKey:'preferred',userVerification:'required'},
        registration:{requireSession:true}})
    ]
  };
}

export function createStarflowAuthLab(config) {
  return betterAuth(authOptions(config));
}
