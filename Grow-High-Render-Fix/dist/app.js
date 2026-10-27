const $ = s=>document.querySelector(s);
const dialog=$('#info-dialog');
let lastFocus;
const demo=$('#google');demo.id='demo';demo.textContent='Explore a working demo ↗';
$('.preview-note').textContent='Local workspace · Your data is saved on this computer';
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
$('#demo').onclick=async e=>{e.target.disabled=true;try{await api('demo',{});location.href='/workspace.html';}catch(err){$('#form-status').hidden=false;$('#form-status').textContent=err.message;e.target.disabled=false;}};
$('#signup').onclick=()=>{
  modal('Your next chapter starts here.','Create your business workspace. Your records stay saved on this computer.',`<form id="registration"><label for="new-name">Your name</label><input id="new-name" name="name" required maxlength="100" autocomplete="name"><label for="company">Business name</label><input id="company" name="company" required maxlength="150" autocomplete="organization"><label for="new-email">Email</label><input id="new-email" name="email" type="email" required autocomplete="email"><label for="new-password">Password · at least 10 characters</label><input id="new-password" name="password" type="password" minlength="10" maxlength="128" required autocomplete="new-password"><button class="primary" type="submit">Create my workspace →</button><p role="status"></p></form>`);
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
const details={privacy:['Your business, your data.','Accounts and business records are saved in a local SQLite database on this computer. Passwords use salted scrypt hashes; sessions use HttpOnly cookies. This local version does not send data to analytics or AI services.'],terms:['Local development edition.','This is working local software for evaluating your business workflows. Hosted deployment, external integrations, and production security hardening remain separate setup steps.'],help:['Get started with Grow High.','Choose “Explore a working demo” to inspect the software with sample data, or “Create an account” for an empty business workspace. Keep the local server running while using the app.']};
document.querySelectorAll('[data-info]').forEach(b=>b.onclick=()=>modal(...details[b.dataset.info]));
$('.theme').onclick=()=>{const dark=document.body.classList.toggle('dark');$('.theme').textContent=dark?'☀':'☾';$('.theme').setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');};

if(new URLSearchParams(location.search).get('reason')==='session-expired'){$('#form-status').hidden=false;$('#form-status').textContent='Your session expired. Sign in again to continue. Your unsent assistant question is kept in this tab.';}
