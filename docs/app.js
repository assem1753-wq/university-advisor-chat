const chatEl = document.getElementById("chat");
const quickRepliesEl = document.getElementById("quick-replies");
const formEl = document.getElementById("input-form");
const inputEl = document.getElementById("user-input");

const state = {
  step: "score",
  score: null,
  specialty: null,
  city: null,
  benefits: null,
};

function addMessage(text, sender) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${sender}`;
  bubble.innerHTML = text;
  chatEl.appendChild(bubble);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function clearQuickReplies() {
  quickRepliesEl.innerHTML = "";
}

function addQuickReplies(options) {
  clearQuickReplies();
  options.forEach(({ label, value }) => {
    const btn = document.createElement("button");
    btn.className = "quick-reply";
    btn.textContent = label;
    btn.onclick = () => handleUserValue(value, label);
    quickRepliesEl.appendChild(btn);
  });
}

function setInputMode(visible) {
  formEl.style.display = visible ? "flex" : "none";
}

function classifyMargin(margin) {
  if (margin < 0) return { label: "риск: недостижимо по данным 2025 г.", cls: "risk-high" };
  if (margin < 10) return { label: "минимальный запас", cls: "risk-med" };
  if (margin < 25) return { label: "уверенный запас", cls: "risk-low" };
  return { label: "высокий запас", cls: "risk-none" };
}

function buildTable(list) {
  const rows = list
    .map((u) => {
      const { label, cls } = classifyMargin(u.margin);
      return `<tr>
        <td>${u.name}</td>
        <td>${u.city}</td>
        <td>${u.score2025}</td>
        <td>${u.grants}</td>
        <td class="${cls}">${u.margin >= 0 ? "+" : ""}${u.margin}</td>
        <td class="${cls}">${label}</td>
      </tr>`;
    })
    .join("");
  return `<table class="uni-table">
    <thead><tr><th>Вуз</th><th>Город</th><th>Балл 2025</th><th>Грантов</th><th>Запас</th><th>Риск</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function pickBest(list, predicate, excludeNames) {
  return list
    .filter((u) => predicate(u) && !excludeNames.has(u.name))
    .sort((a, b) => b.grants - a.grants)[0];
}

function recommend() {
  const { score, city, benefits, specialty } = state;
  const withMargin = specialty.universities.map((u) => ({ ...u, margin: score - u.score2025 }));

  let pool = withMargin.filter((u) => u.margin >= -5);
  let cityNote = "";
  if (city !== "Любой") {
    const filtered = pool.filter((u) => u.city === city);
    if (filtered.length > 0) {
      pool = filtered;
    } else {
      cityNote = `<p class="note">В списке нет вузов из города «${city}» с подходящим баллом — показаны варианты по всем городам.</p>`;
    }
  }

  pool.sort((a, b) => a.margin - b.margin);

  const excluded = new Set();
  const ambitious = pickBest(pool, (u) => u.margin >= -5 && u.margin < 10, excluded);
  if (ambitious) excluded.add(ambitious.name);
  const mid = pickBest(pool, (u) => u.margin >= 10 && u.margin < 25, excluded);
  if (mid) excluded.add(mid.name);
  const safe = pickBest(pool, (u) => u.margin >= 25, excluded);
  if (safe) excluded.add(safe.name);

  const picks = [ambitious, mid, safe].filter(Boolean);

  let text = `<p>Специальность: <b>${specialty.name}</b>. По баллу ЕНТ <b>${score}/140</b> вот рекомендованный порядок приоритетов при подаче заявления:</p><ol>`;
  picks.forEach((u) => {
    const { label } = classifyMargin(u.margin);
    text += `<li><b>${u.name}</b> (${u.city}) — проходной балл 2025: ${u.score2025}, грантов: ${u.grants}, запас: ${u.margin >= 0 ? "+" : ""}${u.margin} (${label})</li>`;
  });
  text += "</ol>";

  if (picks.length === 0) {
    text += `<p class="note">По этой специальности с текущим баллом нет достижимых вариантов среди учтённых вузов — рассмотрите резервные вузы ниже или другую специальность.</p>`;
  } else if (picks.length < 3 && specialty.reserveUniversities?.length) {
    text += `<p class="note">Вариантов с большим запасом мало — рассмотрите также резервные вузы: ${specialty.reserveUniversities.join(", ")}.</p>`;
  }

  if (benefits && benefits !== "Нет льгот") {
    text += `<p class="note">У вас указана льгота «${benefits}» — уточните в приёмной комиссии выбранных вузов и на egov.kz, как именно она учитывается в конкурсе (доп. баллы или отдельная квота), это не отражено в таблице проходных баллов.</p>`;
  }

  text += cityNote;
  text += `<p>Полная таблица вариантов (отсортировано по возрастанию запаса):</p>${buildTable(pool)}`;
  text += `<p class="note">⚠️ Это данные конкурса 2025 года, проходные баллы 2026 года станут известны только по итогам конкурса (август 2026), возможны колебания ±3–7 баллов.</p>`;

  addMessage(text, "bot");
  addQuickReplies([{ label: "Начать заново", value: "restart" }]);
  setInputMode(false);
}

function handleUserValue(value, displayLabel) {
  if (value === "restart") {
    Object.assign(state, { step: "score", score: null, specialty: null, city: null, benefits: null });
    chatEl.innerHTML = "";
    clearQuickReplies();
    askScore();
    return;
  }

  addMessage(displayLabel ?? value, "user");

  if (state.step === "score") {
    const score = parseInt(value, 10);
    if (isNaN(score) || score < 0 || score > 140) {
      addMessage("Введите балл ЕНТ числом от 0 до 140.", "bot");
      return;
    }
    state.score = score;
    state.step = "subjects";
    askSubjects();
  } else if (state.step === "subjects") {
    const combo = SUBJECT_COMBINATIONS.find((c) => c.subjects.join(" + ") === value);
    state.step = "specialty";
    askSpecialty(combo);
  } else if (state.step === "specialty") {
    state.specialty = SPECIALTIES[value];
    state.step = "city";
    askCity();
  } else if (state.step === "city") {
    state.city = value;
    state.step = "benefits";
    askBenefits();
  } else if (state.step === "benefits") {
    state.benefits = value;
    state.step = "done";
    recommend();
  }
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = inputEl.value.trim();
  if (!value) return;
  inputEl.value = "";
  handleUserValue(value);
});

function askScore() {
  addMessage(
    "Привет! Я помогу подобрать вуз для поступления на грант. Какой у тебя балл ЕНТ (из 140)?",
    "bot"
  );
  clearQuickReplies();
  setInputMode(true);
  inputEl.focus();
}

function askSubjects() {
  addMessage("Какие два профильных предмета ты сдавал(а) на ЕНТ?", "bot");
  setInputMode(false);
  addQuickReplies(
    SUBJECT_COMBINATIONS.map((c) => {
      const label = c.subjects.join(" + ");
      return { label, value: label };
    })
  );
}

function askSpecialty(combo) {
  const available = combo.gopCodes.map((code) => SPECIALTIES[code]).filter(Boolean);
  if (available.length === 0) {
    addMessage(
      "По этой комбинации предметов данные по вузам пока собираются. Попробуй выбрать другую комбинацию или зайди позже.",
      "bot"
    );
    addQuickReplies([{ label: "Начать заново", value: "restart" }]);
    return;
  }
  if (available.length === 1) {
    handleUserValue(available[0].code, available[0].name);
    return;
  }
  addMessage("Какая специальность интересует?", "bot");
  addQuickReplies(available.map((s) => ({ label: s.name, value: s.code })));
}

function askCity() {
  addMessage("В каком городе рассматриваешь обучение?", "bot");
  setInputMode(false);
  addQuickReplies([
    { label: "Алматы", value: "Алматы" },
    { label: "Астана", value: "Астана" },
    { label: "Любой город", value: "Любой" },
  ]);
}

function askBenefits() {
  addMessage("Есть ли у тебя льготы, влияющие на конкурс (Алтын белгі, олимпиады, соц. категория)?", "bot");
  addQuickReplies([
    { label: "Нет льгот", value: "Нет льгот" },
    { label: "Алтын белгі", value: "Алтын белгі" },
    { label: "Олимпиада", value: "Олимпиада" },
    { label: "Соц. категория", value: "Соц. категория" },
  ]);
}

askScore();
