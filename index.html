<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Розклад поїздів</title>

<style>
html, body {
  margin:0;
  padding:0;
  height:100%;
}

body {
  color:#fff;
  font-family:Arial;
  display:flex;
  justify-content:center;
  align-items:flex-start;
  min-height:100vh;

  background: linear-gradient(-45deg,
    #f1df30,#04b6cb,#1cbca4,#c5d444,#26bc93
  );
  background-size:400% 400%;
  animation: gradientMove 60s ease infinite;
}

@keyframes gradientMove {
  0% {background-position:0% 50%;}
  50% {background-position:100% 50%;}
  100% {background-position:0% 50%;}
}

.wrapper {
  width:100%;
  max-width:900px;
  padding:10px;
}

.widget {
  background:rgba(0,0,0,0.6);
  padding:14px;
  border-radius:16px;
}

.table-head,
.train {
  display:grid;
  grid-template-columns: 20% 1fr 20%;
  align-items:center;
  justify-items:center;
}

.table-head {
  font-weight:700;
  border-bottom:2px solid #aaa;
  padding-bottom:8px;
}

.train {
  padding:10px 0;
  border-bottom:1px solid rgba(255,255,255,0.2);
  cursor:pointer;
}

/* шторки */
.details {
  max-height:0;
  overflow:hidden;
  opacity:0;
  transition:all 0.4s ease;
}

.details.open {
  max-height:2000px;
  opacity:1;
  padding:10px 0;
}

.details-divider {
  width:60%;
  height:1px;
  background:#fff;
  margin:10px auto;
}

.details-note {
  text-align:center;
  font-weight:bold;
}

/* 🔥 СЕТКА */
.schedule-grid {
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:10px;
}

@media (max-width:600px){
  .schedule-grid { grid-template-columns:1fr; }
}

@media (min-width:601px) and (max-width:900px){
  .schedule-grid { grid-template-columns:repeat(2,1fr); }
}

.schedule-column {
  background:rgba(255,255,255,0.1);
  border-radius:10px;
  padding:8px;
}

.schedule-row {
  display:flex;
  justify-content:space-between;
  gap:10px;
  padding:6px 0;
  border-bottom:1px dashed #aaa;
  font-size:14px;
}

.schedule-row span:first-child {
  flex:1;
  white-space:normal;
}

.schedule-row span:last-child {
  min-width:50px;
  text-align:right;
  font-weight:bold;
}

.station-number {
  margin-right:6px;
  color:#ffcc00;
  font-weight:bold;
}

.schedule-row:last-child {
  border-bottom:none;
}
</style>
</head>

<body>

<div class="wrapper">

<div class="widget">
  <div class="table-head">
    <div>№</div>
    <div>Маршрут</div>
    <div>Відпр.</div>
  </div>

  <div id="list"></div>
</div>

</div>

<script>

/* 6008 */
const fullSchedule6008 = [
["П'ятихатки-Пас.","04:43"],["з.п. 77 км","04:49"],["з.п. Касинівка","04:54"],["з.п. 88 км","05:01"],["Ерастівка","05:07"],
["Вільногірськ","05:16"],["з.п. 104 км","05:21"],["з.п. Гранове","05:26"],["з.п. 114 км","05:30"],["Верхівцеве","05:36"],
["з.п. 119 км","05:39"],["з.п. 125 км","05:44"],["з.п. 128 км","05:48"],["Верхньодніпровськ","06:15"],["з.п. 139 км","06:22"],
["Воскобійня","06:28"],["з.п. 149 км","06:36"],["Кам'янське-Пас.","06:42"],["Запоріжжя-Кам’янське","06:47"],["з.п. 160 км","06:50"],
["з.п. 164 км","06:55"],["з.п. 165 км","06:58"],["з.п. 169 км","07:03"],["Сухачівка","07:06"],["з.п. 175 км","07:10"],
["з.п. 178 км","07:14"],["Діївка","07:18"],["з.п. 184 км","07:23"],["Горяїнове","07:27"],["Дніпро-Гол.","07:32"]
];

/* 6010 */
const fullSchedule6010 = [
["П'ятихатки-Пас.","05:30"],["з.п. Касинівка","05:39"],["з.п. 88 км","05:46"],["Ерастівка","05:51"],
["Вільногірськ","06:01"],["Верхівцеве","06:19"],["з.п. 119 км","06:22"],
["з.п. 125 км","06:27"],["з.п. 128 км","06:31"],["Верхньодніпровськ","06:38"],
["з.п. 139 км","06:45"],["Воскобійня","06:49"],["з.п. 149 км","06:57"],
["Кам'янське-Пас.","07:17"],["Запоріжжя-Кам’янське","07:23"],
["з.п. 160 км","07:26"],["з.п. 164 км","07:31"],["з.п. 165 км","07:34"],
["з.п. 169 км","07:39"],["Сухачівка","07:42"],["з.п. 175 км","07:46"],
["з.п. 178 км","07:50"],["Діївка","07:54"],["з.п. 184 км","07:59"],
["Горяїнове","08:03"],["Дніпро-Гол.","08:09"]
];

function renderGrid(data){
  let i=1;
  const cols=[];
  for(let j=0;j<data.length;j+=10){
    cols.push(data.slice(j,j+10));
  }

  return `
    <div class="schedule-grid">
      ${cols.map(col=>`
        <div class="schedule-column">
          ${col.map(r=>`
            <div class="schedule-row">
              <span><span class="station-number">${i++}.</span>${r[0]}</span>
              <span>${r[1]}</span>
            </div>
          `).join("")}
        </div>
      `).join("")}
    </div>
  `;
}

function render(el,data){
  el.innerHTML="";
  data.forEach(x=>{
    const id="d-"+x.number;

    el.innerHTML+=`
      <div class="train" onclick="toggle('${id}')">
        <div>${x.number}</div>
        <div>${x.route}</div>
        <div>${x.time}</div>
      </div>

      <div class="details" id="${id}">
        ${x.number==="6008" ? renderGrid(fullSchedule6008) : ""}
        ${x.number==="6010" ? renderGrid(fullSchedule6010) : ""}
        <div class="details-divider"></div>
        <div class="details-note">змін немає...</div>
      </div>
    `;
  });
}

function toggle(id){
  document.getElementById(id).classList.toggle("open");
}

fetch("https://vilnohirsk-trains-production.up.railway.app/api/trains")
.then(r=>r.json())
.then(d=>render(list,d.trains));

</script>

</body>
</html>
