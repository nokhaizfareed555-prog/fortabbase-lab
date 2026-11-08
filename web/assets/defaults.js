/* Factory content. The site falls back to this for anything not yet saved, and "Set to default" restores it. */
(function(){
const t=(id,name,category,o={})=>({id,name,category,description:'',sample:'Blood',fasting:'',price:'',discount:0,variants:[],active:true,isPanel:false,includes:[],suggest:true,reason:'',...o});
const p=(id,name,includes,reason,o={})=>t(id,name,'Panels',{isPanel:true,includes,reason,...o});
window.FA_DEFAULTS={
brand:{name:'Fort Abbas Poly Clinic Laboratories',short:'Fort Abbas Poly Clinic',tagline:'Complete care. Reliable diagnostics. Close to home.',logo:'/img/logo.webp',regNo:'R-No 88579'},
theme:{base:'#14396f',accent:'#0c8f8b',highlight:'#d81f26',headingFont:'Plus Jakarta Sans',bodyFont:'Inter',radius:18},
effects:{meshOn:true,meshOpacity:.1,meshSize:92,glassOn:true,glassBlur:16,rippleOn:true,rippleIntensity:.55,rippleRadius:130,rippleDuration:850,rippleBlur:5,rippleAberration:4,rippleRings:2,rippleTint:'#bfe9ff'},
layout:{sections:[{id:'hero',label:'Hero',on:true},{id:'trust',label:'Registrations',on:true},{id:'services',label:'Services',on:true},{id:'team',label:'Doctors and team',on:true},{id:'panels',label:'Popular panels',on:true},{id:'faq',label:'Questions',on:true},{id:'visit',label:'Visit us',on:true}]},
hero:{items:[{id:'eyebrow',on:true},{id:'title',on:true},{id:'text',on:true},{id:'buttons',on:true},{id:'stats',on:true}],eyebrow:'Open 24 hours, 7 days a week · Fort Abbas',title:'Quality healthcare, closer to home.',text:'OPD consultations, diagnostic laboratory, digital X-ray and home sample collection, all under one roof on Highway Road, Fort Abbas.',btn1:'Book a lab test',btn1Link:'/tests.html',btn2:'WhatsApp us',image:'/img/clinic.webp',imageOn:true,imageSide:'right',stats:[{value:'24/7',label:'Open every day'},{value:'4.4 ★',label:'Google rating (18 reviews)'},{value:'7',label:'Doctors on our panel'}]},
trust:{heading:'Registrations and regulators',text:'',items:[{name:'Punjab Healthcare Commission',note:'Registration R-No 88579',image:'/img/phc.webp'},{name:'Pakistan Nuclear Regulatory Authority',note:'Digital X-ray services',image:'/img/pnra.webp'}]},
services:{heading:'What we do',text:'Consultation, testing and imaging in one visit.',imagesOn:true,items:[
{title:'OPD Consultations',text:'Medical consultations, assessment and treatment guidance.',image:'/img/svc-opd.webp'},
{title:'Diagnostic Laboratory',text:'A wide range of laboratory tests for accurate and timely results.',image:'/img/svc-lab.webp'},
{title:'Digital X-ray',text:'Digital imaging to support the diagnosis and evaluation of conditions.',image:'/img/svc-xray.webp'},
{title:'Home Sample Collection',text:'Ask about arranging laboratory sample collection at home.',image:'/img/svc-lab.webp'}]},
team:{heading:'Our doctors and team',text:'Check who is in before you travel.',imagesOn:true,roles:[{id:'doctors',name:'Doctors'},{id:'technologists',name:'Lab Technologists'},{id:'technicians',name:'Lab Technicians'}],members:[
{id:'m1',role:'doctors',name:'Dr. Sufyan Shabbir',title:'Deputy Medical Superintendent, Fort Abbas Poly Clinic',qualifications:'MBBS, RMP, BSc',description:'GDMO Punjab Rangers. Ex PGR, Ganga Ram Hospital Lahore.',years:'',schedule:'',image:'/img/dr-sufyan.webp'},
{id:'m2',role:'doctors',name:'Dr. Abdul Razzaq',title:'',qualifications:'MBBS, FCPS (Medicine)',description:'',years:'',schedule:'Saturday and Sunday',image:''},
{id:'m3',role:'doctors',name:'Dr. Eman Fatima',title:'',qualifications:'MBBS',description:'Former in-charge, NCD Clinic, THQ Hospital Fort Abbas.',years:'',schedule:'Monday to Saturday',image:''},
{id:'m4',role:'doctors',name:'Dr. Moazzam Abdullah',title:'Child Physician',qualifications:'MBBS',description:'',years:'',schedule:'Daily, 9 AM to 7 PM',image:''},
{id:'m5',role:'doctors',name:'Dr. Aqsa Aleem Baryar',title:'Consultant Radiologist',qualifications:'MBBS, FCPS (Diagnostic Radiology)',description:'',years:'',schedule:'Saturday and Sunday',image:''},
{id:'m6',role:'doctors',name:'Dr. Sania Shabbir',title:'Women Medical Officer',qualifications:'MBBS (Gold Medalist), RMP, WMO',description:'',years:'',schedule:'Saturday and Sunday',image:''},
{id:'m7',role:'doctors',name:'Dr. M. A. Zafar',title:'Consultant Pathologist',qualifications:'MBBS, M.Phil (Microbiology)',description:'',years:'',schedule:'Monday to Saturday',image:''}]},
tests:{heading:'Book a lab test',text:'Pick your tests, then choose a visit or home collection. We confirm by phone.',suggestPanels:true,panelsHeading:'Popular panels',panelsText:'Tests that doctors usually read together.',priceFallback:'Ask for price',items:[
t('cbc','CBC (Complete Blood Count)','Blood',{description:'Red cells, white cells, platelets and haemoglobin.'}),
t('fbs','Fasting Blood Sugar','Diabetes',{fasting:'8 hours'}),t('rbs','Random Blood Sugar','Diabetes'),t('hba1c','HbA1c','Diabetes',{description:'Average blood sugar over about 3 months.'}),
t('chol','Total Cholesterol','Heart'),t('tg','Triglycerides','Heart',{fasting:'9 to 12 hours'}),t('hdl','HDL Cholesterol','Heart'),t('ldl','LDL Cholesterol','Heart'),
t('bili','Bilirubin','Liver'),t('alt','ALT (SGPT)','Liver'),t('ast','AST (SGOT)','Liver'),t('alp','Alkaline Phosphatase','Liver'),t('alb','Serum Albumin','Liver'),
t('urea','Blood Urea','Kidney'),t('creat','Serum Creatinine','Kidney'),t('uric','Uric Acid','Kidney'),t('elec','Serum Electrolytes','Kidney'),
t('tsh','TSH','Thyroid'),t('t3','T3','Thyroid'),t('t4','T4','Thyroid'),
t('vitd','Vitamin D','Vitamins'),t('b12','Vitamin B12','Vitamins'),t('ferr','Serum Ferritin','Blood'),
t('hbs','HBsAg (Hepatitis B)','Infection'),t('hcv','Anti-HCV (Hepatitis C)','Infection'),t('widal','Typhidot','Infection'),t('mp','Malaria Parasite','Infection'),
t('urine','Urine Complete Examination','Urine',{sample:'Urine'}),
p('p-lipid','Lipid Profile',['chol','tg','hdl','ldl'],'One cholesterol number can look normal while the others are not. Doctors judge heart risk from all four together.',{fasting:'9 to 12 hours'}),
p('p-lft','Liver Function Tests',['bili','alt','ast','alp','alb'],'A single liver marker cannot show where a problem is. The full set helps your doctor tell one cause from another.'),
p('p-rft','Renal Function Tests',['urea','creat','uric','elec'],'Kidney changes often have no symptoms. Reading these together gives a clearer picture from one sample.'),
p('p-thy','Thyroid Profile',['tsh','t3','t4'],'TSH alone can miss some thyroid problems. T3 and T4 show how the gland is really working.'),
p('p-dia','Diabetes Check',['fbs','hba1c'],'Fasting sugar shows today. HbA1c shows the last 3 months. Together they tell the real story.',{fasting:'8 hours'})]},
faq:{heading:'Frequently asked questions',items:[{q:'Are you open at night?',a:'Yes. We are open 24 hours, 7 days a week.'},{q:'Do I need an appointment for a lab test?',a:'No, you can walk in. Booking online lets us prepare for you.'},{q:'Can you collect a sample from my home?',a:'Yes. Choose home collection when booking and we will confirm the arrangement by phone.'},{q:'Do I need to fast?',a:'Some tests need fasting. It is shown beside the test, and we will remind you when we confirm.'}]},
visit:{heading:'Visit us',address:'Highway Road Fort Abbas, Fort Abbas Haroonabad Rd, Dahranwala - Fort Abbas Rd, Fort Abbas',phone:'0321 2511141',whatsapp:'923212511141',hours:'Open 24 hours, 7 days a week',map:'https://www.google.com/maps/search/?api=1&query=Fort+Abbas+Poly+Clinic+Lab+%26+Digital+X-Ray+Center',footer:'Reports and test information on this site do not replace advice from your doctor.'},
blog_page:{heading:'Health awareness',text:'New discoveries, common myths and practical health information.'},
blog_agent:{enabled:false,autoPublish:false,postsPerWeek:3,provider:'gemini',model:'gemini-2.5-flash',niches:[{name:'New medical discoveries'},{name:'Common health myths'},{name:'Lab tests explained'},{name:'Diabetes and heart health'},{name:"Women's and children's health"}],audience:'People worldwide, with attention to Pakistan',rules:'Medical information only. Cite reliable sources such as WHO, NIH, CDC and peer-reviewed journals. Never give personal dosing or diagnosis. Advise seeing a doctor.'}
};
})();
