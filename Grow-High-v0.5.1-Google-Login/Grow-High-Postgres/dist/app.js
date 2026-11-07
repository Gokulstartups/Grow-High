const $ = s=>document.querySelector(s);
const dialog=$('#info-dialog');
let lastFocus;

$('.preview-note').textContent='Connected workspace · Records are saved on the server';
if(location.protocol==='file:') {
  $('#form-status').hidden=false;$('#form-status').textContent='Open the running app at http://127.0.0.1:4180. Start Grow High using Start-Grow-High.cmd if it is not running.';
  document.querySelectorAll('form input').forEach(x=>x.disabled=true);
  $('.primary').type='button';$('.primary').textContent='Open Grow High application →';$('.primary').onclick=()=>location.href='http://127.0.0.1:4180';
}
async function api(route,data){
  if(location.protocol==='file:'){location.href='http://127.0.0.1:4180';throw Error('Opening local server');}
  const r=await fetch('/api/'+route,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
  const b=await r.json();if(!r.ok)throw Error(b.error);return b;
}
function modal(title,text,content=''){
  lastFocus=document.activeElement;$('#dialog-title').textContent=title;$('#dialog-description').textContent=text;
  $('#recovery-form').hidden=true;$('#dialog-done').hidden=!!content;$('#extra-form')?.remove();
  if(content){const div=document.createElement('div');div.id='extra-form';div.innerHTML=content;dialog.append(div);}dialog.showModal();
}
function error(form,message){let el=form.querySelector('[role=status]');if(!el){el=document.createElement('p');el.role='status';form.append(el);}el.textContent=message;}
async function submitForm(form,fn){const button=form.querySelector('button[type=submit],button.primary');button.disabled=true;try{await fn();}catch(e){error(form,e.message);}finally{button.disabled=false;}}
$('.close').onclick=()=>dialog.close();$('#dialog-done').onclick=()=>dialog.close();dialog.addEventListener('close',()=>lastFocus?.focus());
$('#toggle-password').onclick=()=>{const show=$('#password').type==='password';$('#password').type=show?'text':'password';$('#toggle-password').setAttribute('aria-label',show?'Hide password':'Show password');$('#toggle-password').setAttribute('aria-pressed',String(show));};
$('#login-form').onsubmit=e=>{e.preventDefault();submitForm(e.target,async()=>{await api('login',{email:$('#email').value,password:$('#password').value,remember:e.target.remember.checked});location.href='/workspace.html'+(new URLSearchParams(location.search).get('next')==='assistant'?'#assistant':'');});};

$('#signup').onclick=()=>{
  modal('Your next chapter starts here.','Create your business workspace. Your records stay saved in your workspace.',`<form id="registration"><label for="new-name">Your name</label><input id="new-name" name="name" required maxlength="100" autocomplete="name"><label for="company">Business name</label><input id="company" name="company" required maxlength="150" autocomplete="organization"><label for="new-email">Email</label><input id="new-email" name="email" type="email" required autocomplete="email"><label for="new-password">Password · at least 10 characters</label><input id="new-password" name="password" type="password" minlength="10" maxlength="128" required autocomplete="new-password"><button class="primary" type="submit">Create my workspace →</button><p role="status"></p></form>`);
  $('#registration').onsubmit=e=>{e.preventDefault();submitForm(e.target,async()=>{
    const result=await api('register',Object.fromEntries(new FormData(e.target)));
    $('#dialog-title').textContent='Save your recovery code.';$('#dialog-description').textContent='Keep this code somewhere safe. It can reset your password if you forget it. It is shown only once.';
    $('#extra-form').replaceChildren();const code=document.createElement('code');code.textContent=result.recovery;code.style.cssText='display:block;overflow-wrap:anywhere;padding:16px;background:var(--bg);border-radius:8px;margin-bottom:20px;user-select:all';
    const button=document.createElement('button');button.className='primary';button.textContent='I saved it — open my workspace';button.onclick=()=>location.href='/workspace.html';$('#extra-form').append(code,button);
  });};
};
$('#forgot').onclick=()=>{
  modal('Recover your workspace.','Use the recovery code you saved when creating your account.',`<form id="reset"><label for="reset-email">Email</label><input id="reset-email" name="email" type="email" required autocomplete="email"><label for="reset-code">Recovery code</label><input id="reset-code" name="recovery" required autocomplete="off"><label for="reset-password">New password · at least 10 characters</label><input id="reset-password" name="password" type="password" minlength="10" maxlength="128" required autocomplete="new-password"><button class="primary" type="submit">Reset password</button><p role="status"></p></form>`);
  $('#reset').onsubmit=e=>{e.preventDefault();submitForm(e.target,async()=>{const r=await api('recover',Object.fromEntries(new FormData(e.target)));error(e.target,'Password reset. Save your replacement recovery code: '+r.recovery);e.target.querySelector('button').hidden=true;});};
};
const details={privacy:['Your business, your data.','Accounts and business records are saved in the configured server database. Passwords use salted scrypt hashes; sessions use HttpOnly cookies. This local version does not send data to analytics or AI services.'],terms:['Grow High workspace.','Use this workspace for your business workflows. Email, subscriptions and production operations require separate configuration.'],help:['Get started with Grow High.','Use Google or your email and password to sign in, or choose “Create an account” for an empty business workspace. Use your configured application address.']};
document.querySelectorAll('[data-info]').forEach(b=>b.onclick=()=>modal(...details[b.dataset.info]));
$('.theme').onclick=()=>{const dark=document.body.classList.toggle('dark');$('.theme').textContent=dark?'☀':'☾';$('.theme').setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');};

if(new URLSearchParams(location.search).get('reason')==='session-expired'){$('#form-status').hidden=false;$('#form-status').textContent='Your session expired. Sign in again to continue. Your unsent assistant question is kept in this tab.';}

async function finishGoogle(credential, fields={}){
  const result=await api('auth/google',{credential,...fields});
  if(result.needsPassword||result.needsRegistration){
    const fresh=result.needsRegistration;
    modal(fresh?'Create your workspace':'Link your Google account',fresh?'Choose a business name and a backup password.':'Enter your existing Grow High password once to connect Google securely.',`<form id="google-link">${fresh?'<label for="google-company">Business name</label><input id="google-company" name="company" required maxlength="150">':''}<label for="google-password">${fresh?'Backup password · at least 10 characters':'Grow High password'}</label><input id="google-password" name="password" type="password" required ${fresh?'minlength="10"':''} maxlength="128" autocomplete="${fresh?'new-password':'current-password'}"><button type="submit" class="primary">Continue</button><p role="status"></p></form>`);
    $('#google-link').onsubmit=e=>{e.preventDefault();submitForm(e.target,()=>finishGoogle(credential,Object.fromEntries(new FormData(e.target))));};
    return;
  }
  const next=()=>location.href='/workspace.html'+(new URLSearchParams(location.search).get('next')==='assistant'?'#assistant':'');
  if(result.recovery){
    dialog.close();modal('Save your recovery code','Keep this code safe. You can use it to recover your account.');
    const code=document.createElement('p');code.id='extra-form';code.textContent=result.recovery;code.style.overflowWrap='anywhere';dialog.append(code);$('#dialog-done').onclick=next;
  }else next();
}
async function setupGoogle(){
  const button=$('#google');
  const status=message=>{$('#form-status').hidden=false;$('#form-status').textContent=message;};
  button.onclick=()=>status('Google sign-in is loading. Please try again shortly.');
  try{
    const config=await api('auth/google/config');
    if(!config.clientId){button.onclick=()=>status('Google sign-in is not configured yet. Please use email and password for now.');return;}
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=resolve;script.onerror=reject;document.head.append(script);});
    google.accounts.id.initialize({client_id:config.clientId,nonce:config.nonce,auto_select:false,callback:async result=>{try{await finishGoogle(result.credential);}catch(e){status(e.message);}}});
    const container=document.createElement('div');container.id='google-signin';button.replaceWith(container);
    google.accounts.id.renderButton(container,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',width:Math.min(400,container.parentElement.clientWidth)});
  }catch{button.onclick=()=>status('Google sign-in could not load. Check your connection, refresh, or use email and password.');}
}
if(location.protocol!=='file:')setupGoogle();
