
const pages = [
  "loginPage",
  "signupPage",
  "dashboardPage",
  "reportPage",
  "searchPage",
  "aboutPage"
];

const backButton = document.getElementById("backButton");
let currentUser = null;
let currentPage = "loginPage";
let pageHistory = []; // pages visited before this one, for the back arrow
let suggestedPassword = "";
let passwordMode = "suggestion";

function getUsers() {
  return JSON.parse(localStorage.getItem("campusUsers") || "[]");
}

function saveUsers(users) {
  localStorage.setItem("campusUsers", JSON.stringify(users));
}

function getItems() {
  return JSON.parse(localStorage.getItem("campusItems") || "[]");
}

function saveItems(items) {
  localStorage.setItem("campusItems", JSON.stringify(items));
}

// MATCHING: a Lost report disappears once a matching Found report exists
const NAME_STOPWORDS = new Set(["a", "an", "the", "my", "of", "and", "with", "in", "on", "for", "lost", "found"]);

function nameTokens(text) {
  return new Set(
    (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter(word => word && !NAME_STOPWORDS.has(word))
      .map(word => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
  );
}

function sameItem(lost, found) {
  // An item cannot have been found before it was lost
  if (found.date && lost.date && found.date < lost.date) return false;

  const a = nameTokens(lost.name);
  const b = nameTokens(found.name);
  if (a.size === 0 || b.size === 0) return false;

  const shared = [...a].filter(word => b.has(word)).length;
  const smaller = Math.min(a.size, b.size);
  const union = new Set([...a, ...b]).size;

  const identical = shared === a.size && shared === b.size;
  const oneContainsOther = shared === smaller && smaller >= 2;
  return identical || oneContainsOther || shared / union >= 0.6;
}

function isLost(item) {
  return (item.status || "Found") === "Lost";
}

// Items shown on the site: no resolved reports, and no lost reports that were found
function getVisibleItems() {
  const items = getItems().filter(item => !item.resolved);
  const found = items.filter(item => !isLost(item));
  return items.filter(item => !isLost(item) || !found.some(f => sameItem(item, f)));
}

function isOwner(item) {
  if (!currentUser) return false;
  if (item.reporterId) return item.reporterId === currentUser.userId;
  return item.reporter === currentUser.firstName + " " + currentUser.lastName;
}

function showPage(pageId, isBack = false) {
  if (pageId !== currentPage && !isBack) {
    const seen = pageHistory.lastIndexOf(pageId);
    if (seen !== -1) pageHistory = pageHistory.slice(0, seen); // going back to an earlier page
    else pageHistory.push(currentPage);
  }
  currentPage = pageId;
  backButton.classList.toggle("hidden", pageHistory.length === 0);
  window.scrollTo(0, 0);
  pages.forEach(id => {
    document.getElementById(id).classList.toggle("hidden", id !== pageId);
  });

  if (pageId === "dashboardPage") {
    renderRecentItems();
  }

  if (pageId === "searchPage") {
    renderSearchResults("");
  }
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.page);
  });
});

backButton.addEventListener("click", () => {
  const previous = pageHistory.pop();
  if (previous) showPage(previous, true);
});

// PASSWORD SUGGESTION
function generatePassword() {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

  const randomValues = new Uint32Array(16);
  crypto.getRandomValues(randomValues);

  return Array.from(
    randomValues,
    number => characters[number % characters.length]
  ).join("");
}

const passwordInput = document.getElementById("newPassword");
const suggestionBox = document.getElementById("passwordSuggestion");
const suggestedPasswordText = document.getElementById("suggestedPassword");

passwordInput.addEventListener("focus", () => {
  if (passwordMode === "own") {
    passwordMode = "suggestion";
    return;
  }

  suggestedPassword = generatePassword();
  suggestedPasswordText.textContent = suggestedPassword;
  suggestionBox.classList.remove("hidden");
});

document.getElementById("useSuggested").addEventListener("click", () => {
  passwordInput.value = suggestedPassword;
  document.getElementById("confirmPassword").value = suggestedPassword;
  suggestionBox.classList.add("hidden");
  passwordMode = "own";
});

document.getElementById("createOwn").addEventListener("click", () => {
  passwordMode = "own";
  passwordInput.value = "";
  document.getElementById("confirmPassword").value = "";
  suggestionBox.classList.add("hidden");
  passwordInput.focus();
});

// SIGNUP
document.getElementById("signupForm").addEventListener("submit", event => {
  event.preventDefault();

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const registrationNumber =
    document.getElementById("registrationNumber").value.trim();
  const userId = document.getElementById("newUserId").value.trim();
  const password = passwordInput.value;
  const confirmPassword =
    document.getElementById("confirmPassword").value;

  if (!/^\d{8}$/.test(registrationNumber)) {
    alert("Registration Number must contain exactly 8 digits.");
    return;
  }

  if (password.length < 8) {
    alert("Password must contain at least 8 characters.");
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  const users = getUsers();

  const alreadyExists = users.some(user =>
    user.userId.toLowerCase() === userId.toLowerCase() ||
    user.email === email ||
    user.registrationNumber === registrationNumber
  );

  if (alreadyExists) {
    alert("Account Already Exists! Please login or use different registration details.");
    return;
  }

  // Demo only: do not store real passwords this way in a live website.
  users.push({
    firstName,
    lastName,
    email,
    registrationNumber,
    userId,
    password
  });

  saveUsers(users);

  alert("Account created successfully! Please login.");
  event.target.reset();
  suggestionBox.classList.add("hidden");
  passwordMode = "suggestion";
  showPage("loginPage");

  // Show the guide immediately after a successful account creation.
  openGuide();
});

// THREE-DOTS MENU: slide-in side drawer (top left)
const menuButton = document.getElementById("menuButton");
const drawer = document.getElementById("drawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const recentToggle = document.getElementById("recentToggle");

function renderDrawerItems() {
  const list = document.getElementById("drawerItems");
  list.replaceChildren();

  const items = getVisibleItems().slice(0, 6);
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "drawer-empty";
    empty.textContent = "No items reported yet";
    list.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "drawer-item";

    const dot = document.createElement("span");
    dot.className = "dot " + (item.status || "Found").toLowerCase();
    const name = document.createElement("span");
    name.className = "drawer-item-name";
    name.textContent = item.name;

    button.append(dot, name);
    button.addEventListener("click", () => {
      closeMenu();
      openItem(item);
    });
    row.appendChild(button);
    list.appendChild(row);
  });
}

function openMenu() {
  drawer.querySelectorAll(".drawer-link").forEach(link => {
    link.classList.toggle("active", link.dataset.page === currentPage);
  });
  renderDrawerItems();
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  drawerBackdrop.classList.remove("hidden");
  menuButton.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  drawerBackdrop.classList.add("hidden");
  menuButton.setAttribute("aria-expanded", "false");
}

menuButton.addEventListener("click", () => {
  if (drawer.classList.contains("open")) closeMenu();
  else openMenu();
});

document.getElementById("closeDrawer").addEventListener("click", closeMenu);
drawerBackdrop.addEventListener("click", closeMenu);

// Home, Search, Report Item and View all already switch pages; also close the drawer
drawer.querySelectorAll("[data-page]").forEach(link => {
  link.addEventListener("click", closeMenu);
});

recentToggle.addEventListener("click", () => {
  const expanded = recentToggle.getAttribute("aria-expanded") === "true";
  recentToggle.setAttribute("aria-expanded", String(!expanded));
  document.getElementById("drawerItems").classList.toggle("hidden", expanded);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenu();
});

// FIRST-TIME VISITOR GUIDE
const guideModal = document.getElementById("guideModal");

function openGuide() {
  closeMenu();
  guideModal.classList.remove("hidden");
  guideModal.querySelector(".modal-card").scrollTop = 0;
  document.getElementById("guideDone").focus({ preventScroll: true });
}

function closeGuide() {
  // Closing the guide only hides it. Login counts are tracked per account.
  guideModal.classList.add("hidden");
}

document.querySelectorAll("[data-guide]").forEach(button => {
  button.addEventListener("click", openGuide);
});
document.getElementById("closeGuide").addEventListener("click", closeGuide);
document.getElementById("guideDone").addEventListener("click", closeGuide);
guideModal.addEventListener("click", event => {
  if (event.target === guideModal) closeGuide();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !guideModal.classList.contains("hidden")) closeGuide();
});

// PROFILE PICTURE AND PROFILE PANEL
const profileButton = document.getElementById("profileButton");
const profileModal = document.getElementById("profileModal");
const avatarFile = document.getElementById("avatarFile");

const CHARACTERS = ["🐱","🐶","🦊","🐼","🐸","🦁","🐵","🐰","🐯","🐨","🦄","🐙","🐧","🤖","👽","👻"];
const BG_COLORS = ["#ffd166","#ff8fa3","#7bdff2","#b2f7ef","#c3aed6","#a0e57d"];
let selectedBg = BG_COLORS[0];

// avatar is "" (initials), a data:image URL (photo) or "emoji:<character>|<colour>"
function paintAvatar(el, user) {
  el.replaceChildren();
  el.style.background = "";
  const avatar = user.avatar || "";

  if (avatar.startsWith("data:image")) {
    const img = document.createElement("img");
    img.src = avatar;
    img.alt = "Profile picture";
    el.appendChild(img);
  } else if (avatar.startsWith("emoji:")) {
    const [emoji, bg] = avatar.slice(6).split("|");
    const span = document.createElement("span");
    span.className = "emoji";
    span.textContent = emoji;
    el.appendChild(span);
    el.style.background = bg;
  } else {
    el.textContent = (user.firstName[0] + user.lastName[0]).toUpperCase();
  }
}

function updateAvatar() {
  menuButton.classList.toggle("hidden", !currentUser);
  if (!currentUser) closeMenu();
  profileButton.classList.toggle("hidden", !currentUser);
  if (currentUser) paintAvatar(profileButton, currentUser);
}

function saveAvatar(value) {
  currentUser.avatar = value;
  const users = getUsers();
  const stored = users.find(u => u.userId === currentUser.userId);
  if (stored) {
    stored.avatar = value;
    saveUsers(users);
  }
  updateAvatar();
  renderProfile();
}

function renderProfile() {
  const user = currentUser;
  const fullName = user.firstName + " " + user.lastName;
  const avatar = user.avatar || "";
  const currentEmoji = avatar.startsWith("emoji:") ? avatar.slice(6).split("|")[0] : "";

  paintAvatar(document.getElementById("profileBigAvatar"), user);
  document.getElementById("profileTitle").textContent = fullName;
  document.getElementById("profileHandle").textContent = "@" + user.userId;
  document.getElementById("pdName").textContent = fullName;
  document.getElementById("pdEmail").textContent = user.email;
  document.getElementById("pdReg").textContent = user.registrationNumber;
  document.getElementById("pdUserId").textContent = user.userId;
  document.getElementById("pdItems").textContent =
    getItems().filter(item => item.reporter === fullName).length;

  const grid = document.getElementById("characterGrid");
  grid.replaceChildren();
  CHARACTERS.forEach(emoji => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "char-btn" + (emoji === currentEmoji ? " selected" : "");
    btn.textContent = emoji;
    btn.setAttribute("aria-label", "Choose character " + emoji);
    btn.addEventListener("click", () => saveAvatar(`emoji:${emoji}|${selectedBg}`));
    grid.appendChild(btn);
  });

  const row = document.getElementById("colorRow");
  row.replaceChildren();
  BG_COLORS.forEach(color => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch" + (color === selectedBg ? " selected" : "");
    btn.style.background = color;
    btn.setAttribute("aria-label", "Background colour " + color);
    btn.addEventListener("click", () => {
      selectedBg = color;
      if (currentEmoji) saveAvatar(`emoji:${currentEmoji}|${color}`);
      else renderProfile();
    });
    row.appendChild(btn);
  });
}

function openProfile() {
  if (!currentUser) return;
  const avatar = currentUser.avatar || "";
  if (avatar.startsWith("emoji:")) selectedBg = avatar.slice(6).split("|")[1];
  renderProfile();
  profileModal.classList.remove("hidden");
}

function closeProfile() {
  profileModal.classList.add("hidden");
}

profileButton.addEventListener("click", openProfile);
document.getElementById("closeProfile").addEventListener("click", closeProfile);
profileModal.addEventListener("click", event => {
  if (event.target === profileModal) closeProfile();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeProfile();
});

document.getElementById("resetAvatarBtn").addEventListener("click", () => saveAvatar(""));
document.getElementById("uploadPhotoBtn").addEventListener("click", () => avatarFile.click());

avatarFile.addEventListener("change", () => {
  const file = avatarFile.files[0];
  avatarFile.value = "";
  if (!file || !currentUser) return;

  if (!file.type.startsWith("image/")) {
    alert("Please choose an image file.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Crop to a centered square and shrink so it fits in storage
      const size = 128;
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d").drawImage(
        img,
        (img.width - side) / 2, (img.height - side) / 2, side, side,
        0, 0, size, size
      );
      saveAvatar(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

// SESSION: log the user in and go to the dashboard
function startSession(user, countLogin = false) {
  currentUser = user;

  // Count only successful manual logins, not page refreshes.
  if (countLogin) {
    const users = getUsers();
    const storedUser = users.find(
      account => account.userId.toLowerCase() === user.userId.toLowerCase()
    );

    if (storedUser) {
      storedUser.loginCount = (Number(storedUser.loginCount) || 0) + 1;
      saveUsers(users);
      currentUser = storedUser;
    }
  }

  try { sessionStorage.setItem("campusCurrentUser", currentUser.userId); } catch (e) {}

  document.getElementById("welcomeName").textContent =
    `Welcome, ${currentUser.firstName}!`;

  updateAvatar();
  showPage("dashboardPage");
  pageHistory = []; // Home is the starting point after login
  backButton.classList.add("hidden");

  // Show the guide during the first two successful logins only.
  if (countLogin && currentUser.loginCount <= 2) {
    openGuide();
  }
}

// LOGIN
document.getElementById("loginForm").addEventListener("submit", event => {
  event.preventDefault();

  const userId = document.getElementById("loginUserId").value.trim();
  const password = document.getElementById("loginPassword").value;

  const user = getUsers().find(account =>
    account.userId.toLowerCase() === userId.toLowerCase() &&
    account.password === password
  );

  if (!user) {
    alert("Invalid User ID or Password.");
    return;
  }

  event.target.reset();
  startSession(user, true);
});

// LOGOUT
document.getElementById("logoutButton").addEventListener("click", () => {
  currentUser = null;
  closeProfile();
  updateAvatar();
  try { sessionStorage.removeItem("campusCurrentUser"); } catch (e) {}
  showPage("loginPage");
  pageHistory = [];
  backButton.classList.add("hidden");
});

// REPORT AN ITEM (LOST OR FOUND)
function updateReportLabels() {
  const status = document.querySelector('input[name="itemStatus"]:checked').value;
  document.getElementById("locationLabel").textContent = `Where Was It ${status}?`;
  document.getElementById("dateLabel").textContent = `Date ${status}`;
}

document.querySelectorAll('input[name="itemStatus"]').forEach(radio => {
  radio.addEventListener("change", updateReportLabels);
});
updateReportLabels();

document.getElementById("reportForm").addEventListener("submit", event => {
  event.preventDefault();

  if (!currentUser) {
    alert("Please login first.");
    showPage("loginPage");
    return;
  }

  const item = {
    id: Date.now(),
    status: document.querySelector('input[name="itemStatus"]:checked').value,
    name: document.getElementById("itemName").value.trim(),
    location: document.getElementById("itemLocation").value.trim(),
    date: document.getElementById("itemDate").value,
    description: document.getElementById("itemDescription").value.trim(),
    reporter: currentUser.firstName + " " + currentUser.lastName,
    reporterId: currentUser.userId
  };

  const items = getItems();
  items.unshift(item);
  saveItems(items);

  // Does this report match an earlier one?
  const earlier = items.slice(1).filter(other => !other.resolved);
  let message = `${item.status} item reported successfully!`;
  let alreadyFound = null;

  if (!isLost(item)) {
    const lostMatch = earlier.find(other => isLost(other) && sameItem(other, item));
    if (lostMatch) {
      message = `Thanks! This matches the lost report "${lostMatch.name}", so that lost report has been removed.`;
    }
  } else {
    alreadyFound = earlier.find(other => !isLost(other) && sameItem(item, other));
    if (alreadyFound) {
      message = `Good news! "${alreadyFound.name}" was already found at ${alreadyFound.location}.`;
    }
  }

  if (!isLost(item)) {
    message += ` Please hand the item over at: ${getDropOffPlace(item)}.`;
  }

  event.target.reset();
  updateReportLabels();
  alert(message);
  showPage("dashboardPage");
  if (alreadyFound) openItem(alreadyFound);
});

// CREATE ITEM CARD
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

function formatDate(isoDate) {
  const [year, month, day] = (isoDate || "").split("-").map(Number);
  if (!year || !month || !day) return isoDate || "";
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Custom water-bottle drawing (there is no water-bottle emoji)
const BOTTLE_SVG = `
<svg viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Water bottle">
  <path d="M22 21 Q22 16 27 16 H37 Q42 16 42 21 V56 Q42 60 38 60 H26 Q22 60 22 56 Z" fill="#e8f5ff"/>
  <path d="M22 34 Q27 31 32 34 T42 34 V56 Q42 60 38 60 H26 Q22 60 22 56 Z" fill="#4aa8ff"/>
  <rect x="22" y="40" width="20" height="9" fill="#ffffff" opacity="0.85"/>
  <path d="M22 21 Q22 16 27 16 H37 Q42 16 42 21 V56 Q42 60 38 60 H26 Q22 60 22 56 Z" fill="none" stroke="#5aa9e6" stroke-width="1.8"/>
  <rect x="27" y="10" width="10" height="7" rx="1.5" fill="#cfe9ff" stroke="#5aa9e6" stroke-width="1.5"/>
  <rect x="25" y="3" width="14" height="8" rx="2.5" fill="#2f6fe4"/>
  <path d="M26.5 22 V37" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
</svg>`;

// PICK AN ICON THAT MATCHES THE ITEM (looks at the name first, then the description)
const ICON_RULES = [
  [/\b(power ?banks?)\b/i, "🔋"],
  [/\b(chargers?|charging|cables?|adapters?|adaptors?)\b/i, "🔌"],
  [/\b(earphones?|earbuds?|airpods?|headphones?|headsets?)\b/i, "🎧"],
  [/\b(laptops?|macbooks?|chromebooks?)\b/i, "💻"],
  [/\b(phones?|mobiles?|iphones?|smartphones?|samsung|galaxy|oneplus|redmi|realme|vivo|oppo|pixel|tablets?|ipads?)\b/i, "📱"],
  [/\b(watch|watches|smartwatch|band)\b/i, "⌚"],
  [/\b(pen ?drives?|usb|flash ?drives?|memory cards?|sd cards?)\b/i, "💾"],
  [/\b(mouse|mice)\b/i, "🖱️"],
  [/\b(keyboards?)\b/i, "⌨️"],
  [/\b(cameras?)\b/i, "📷"],
  [/\b(calculators?)\b/i, "🧮"],
  [/\b(keys?|keychains?|key ?rings?)\b/i, "🔑"],
  [/\b(id cards?|identity cards?|college cards?|student cards?|licen[sc]e)\b/i, "🪪"],
  [/\b(atm|debit|credit|bank cards?|cards?)\b/i, "💳"],
  [/\b(wallets?|purses?)\b/i, "👛"],
  [/\b(passports?)\b/i, "🛂"],
  [/\b(bags?|backpacks?|rucksacks?|handbags?|satchels?|sacks?)\b/i, "🎒"],
  [/\b(lunch ?box(es)?|tiffins?)\b/i, "🍱"],
  [/\b(bottles?|flasks?|tumblers?|sippers?)\b/i, "svg:bottle"],
  [/\b(mugs?|cups?|coffee)\b/i, "☕"],
  [/\b(books?|textbooks?|notes?|novels?)\b/i, "📚"],
  [/\b(notebooks?|diary|diaries|registers?|copy|copies)\b/i, "📓"],
  [/\b(pens?|pencils?|markers?|highlighters?)\b/i, "✏️"],
  [/\b(umbrellas?)\b/i, "☂️"],
  [/\b(glasses|spectacles|specs|sunglasses|goggles)\b/i, "👓"],
  [/\b(jackets?|hoodies?|sweaters?|sweatshirts?|coats?|blazers?|cardigans?)\b/i, "🧥"],
  [/\b(t-?shirts?|shirts?|tops?|kurtas?|dress|dupattas?)\b/i, "👕"],
  [/\b(shoes?|sneakers?|sandals?|slippers?|chappals?|boots?)\b/i, "👟"],
  [/\b(caps?|hats?)\b/i, "🧢"],
  [/\b(scarf|scarves|stoles?|mufflers?)\b/i, "🧣"],
  [/\b(gloves?)\b/i, "🧤"],
  [/\b(rings?|necklaces?|bracelets?|earrings?|chains?|jewell?ery)\b/i, "💍"],
  [/\b(bicycles?|cycles?|bikes?)\b/i, "🚲"],
  [/\b(helmets?)\b/i, "⛑️"],
  [/\b(footballs?|soccer|cricket|balls?)\b/i, "⚽"],
  [/\b(rackets?|rackets|badminton)\b/i, "🏸"],
  [/\b(guitars?|ukuleles?)\b/i, "🎸"],
  [/\b(money|cash|notes? of|rupees?)\b/i, "💵"]
];

function getItemIcon(item) {
  for (const text of [item.name || "", item.description || ""]) {
    for (const [pattern, icon] of ICON_RULES) {
      if (pattern.test(text)) return icon;
    }
  }
  // Nothing recognised: fall back to a generic icon for the status
  return (item.status || "Found") === "Lost" ? "🔎" : "📦";
}

// WHERE TO SUBMIT FOUND ITEMS (also shown below the report form)
// Edit this list to change where each kind of item must be handed in.
// "items" are matched against the item name first, then its description.
// NOTE: the places below are SAMPLES, replace them with your real places.
const DEFAULT_DROP_OFF = "Lost & Found Desk";

const DROP_OFF_POINTS = [
  { place: "Administrative Office",
    items: ["ID card", "Student card", "Admit card", "Aadhaar card", "PAN card", "Voter card", "Driving licence",
            "Driving license", "Passport", "Certificate", "Marksheet", "Fee receipt", "Document", "Folder", "File"] },
  { place: "Security Desk",
    items: ["Phone", "Mobile", "iPhone", "Smartphone", "Laptop", "Tablet", "iPad", "Charger", "Power bank", "Cable",
            "Adapter", "Earphone", "Earbud", "AirPod", "Headphone", "Headset", "Smartwatch", "Watch", "Camera",
            "Pen drive", "USB drive", "Memory card", "SD card", "Calculator", "Mouse", "Keyboard", "Speaker",
            "Wallet", "Purse", "Cash", "Money", "Debit card", "Credit card", "ATM card", "Key", "Keychain",
            "Ring", "Necklace", "Bracelet", "Earring", "Chain", "Jewellery"] },
  { place: "Library Help Desk",
    items: ["Book", "Textbook", "Notebook", "Notes", "Diary", "Register", "Journal", "Novel", "Lab manual",
            "Record book", "Pen", "Pencil", "Marker", "Highlighter", "Eraser", "Sharpener", "Ruler",
            "Geometry box", "Pencil box", "Stapler"] },
  { place: "Student Affairs Office",
    items: ["Bag", "Backpack", "Handbag", "Laptop bag", "Water bottle", "Bottle", "Flask", "Tumbler", "Mug", "Cup",
            "Lunch box", "Tiffin", "Umbrella", "Jacket", "Hoodie", "Sweater", "Sweatshirt", "Coat", "Shirt",
            "T-shirt", "Scarf", "Cap", "Hat", "Glove", "Shoe", "Sandal", "Slipper", "Glasses", "Sunglasses",
            "Spectacles", "Helmet", "Ball", "Football", "Cricket bat", "Racket", "Shuttlecock", "Guitar"] }
];

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const DROP_OFF_RULES = DROP_OFF_POINTS.map(point => ({
  pattern: new RegExp("\\b(?:" + point.items.map(escapeRegex).join("|") + ")(?:e?s)?\\b", "i"),
  place: point.place
}));

function getDropOffPlace(item) {
  for (const text of [item.name || "", item.description || ""]) {
    for (const rule of DROP_OFF_RULES) {
      if (rule.pattern.test(text)) return rule.place;
    }
  }
  return DEFAULT_DROP_OFF;
}

// LOCATION OF THE LOST ITEMS: list shown below the report form
const locationList = document.getElementById("locationList");
const locationSearch = document.getElementById("locationSearch");

function renderLocations(filter = "") {
  const term = filter.trim().toLowerCase();
  locationList.replaceChildren();
  let shown = 0;

  DROP_OFF_POINTS.forEach(point => {
    const items = point.items.filter(name => name.toLowerCase().includes(term));
    if (items.length === 0) return;
    shown += items.length;

    const card = createEl("div", "location-card");
    const title = createEl("h3", "", "📍 " + point.place);
    title.appendChild(createEl("span", "loc-count", items.length + (items.length === 1 ? " item" : " items")));
    const chips = createEl("div", "location-chips");
    items.forEach(name => chips.appendChild(createEl("span", "loc-chip", name)));
    card.append(title, chips);
    locationList.appendChild(card);
  });

  if (term === "") {
    const other = createEl("div", "location-card");
    other.appendChild(createEl("h3", "", "📍 " + DEFAULT_DROP_OFF));
    other.appendChild(createEl("p", "location-note", "Any other item that is not listed above."));
    locationList.appendChild(other);
  } else if (shown === 0) {
    locationList.appendChild(createEl("p", "empty-message",
      `No place is listed for "${filter.trim()}". Submit it at the ${DEFAULT_DROP_OFF}.`));
  }
}

locationSearch.addEventListener("input", () => renderLocations(locationSearch.value));
renderLocations();

// COPY TO CLIPBOARD
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fallback for browsers that block the Clipboard API
    const box = document.createElement("textarea");
    box.value = text;
    box.style.cssText = "position:fixed;opacity:0;top:0;left:0;";
    document.body.appendChild(box);
    box.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (err) {}
    box.remove();
    return ok;
  }
}

function itemToText(item) {
  const status = item.status || "Found";
  return [
    `${status}: ${item.name}`,
    `Location: ${item.location}`,
    `Date: ${formatDate(item.date)}`,
    `Description: ${item.description}`,
    isLost(item) ? "" : `Hand-over point: ${getDropOffPlace(item)}`,
    item.reporter ? `Reported by: ${item.reporter}` : ""
  ].filter(Boolean).join("\n");
}

function createIconEl(item) {
  const icon = getItemIcon(item);
  const iconEl = createEl("span", "card-emoji");
  if (icon === "svg:bottle") iconEl.innerHTML = BOTTLE_SVG;
  else iconEl.textContent = icon;
  return iconEl;
}

function createItemCard(item) {
  const status = item.status || "Found";

  const card = createEl("article", "item-card");

  const media = createEl("div", "card-media");
  media.appendChild(createIconEl(item));

  const body = createEl("div", "card-body");

  const titleRow = createEl("div", "card-title-row");
  titleRow.appendChild(createEl("h3", "", item.name));
  titleRow.appendChild(createEl("span", "badge " + status.toLowerCase(), status));

  const meta = createEl("div", "card-meta");
  meta.appendChild(createEl("span", "", "📍 " + item.location));
  meta.appendChild(createEl("span", "", "• " + formatDate(item.date)));

  body.appendChild(titleRow);
  body.appendChild(createEl("p", "card-desc", item.description));
  body.appendChild(meta);

  const copyBtn = createEl("button", "copy-btn", "📋 Copy details");
  copyBtn.type = "button";
  copyBtn.addEventListener("click", async event => {
    event.stopPropagation(); // do not open the details when copying
    const ok = await copyText(itemToText(item));
    copyBtn.textContent = ok ? "✓ Copied" : "Select the text and press Ctrl+C";
    setTimeout(() => { copyBtn.textContent = "📋 Copy details"; }, 1800);
  });
  body.appendChild(copyBtn);

  card.appendChild(media);
  card.appendChild(body);

  // Tap a card to see all the details
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `View details of ${item.name}`);
  card.addEventListener("click", () => {
    if (String(window.getSelection()).length > 0) return; // user is selecting text
    openItem(item);
  });
  card.addEventListener("keydown", event => {
    if (event.target !== card) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openItem(item);
    }
  });

  return card;
}

// ITEM DETAILS PANEL
const itemModal = document.getElementById("itemModal");
let openedItem = null;

function openItem(item) {
  openedItem = item;
  const status = item.status || "Found";

  const media = document.getElementById("itemModalMedia");
  media.replaceChildren(createIconEl(item));

  document.getElementById("itemModalTitle").textContent = item.name;
  const badge = document.getElementById("itemModalBadge");
  badge.textContent = status;
  badge.className = "badge " + status.toLowerCase();
  document.getElementById("itemModalDesc").textContent = item.description;

  const rows = [
    ["Status", status],
    ["Location", item.location],
    [`Date ${status}`, formatDate(item.date)],
    ...(isLost(item) ? [] : [["Hand-over point", getDropOffPlace(item)]]),
    ["Reported by", item.reporter]
  ];
  if (item.id > 1e12) {
    const d = new Date(item.id);
    rows.push(["Reported on", `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`]);
  }

  const list = document.getElementById("itemModalDetails");
  list.replaceChildren();
  rows.forEach(([label, value]) => {
    if (!value) return;
    list.appendChild(createEl("dt", "", label));
    list.appendChild(createEl("dd", "", value));
  });

  document.getElementById("itemModalCopy").textContent = "📋 Copy details";
  document.getElementById("itemModalResolve")
    .classList.toggle("hidden", !(isLost(item) && isOwner(item)));
  itemModal.classList.remove("hidden");
  document.getElementById("closeItem").focus();
}

function closeItem() {
  itemModal.classList.add("hidden");
  openedItem = null;
}

document.getElementById("closeItem").addEventListener("click", closeItem);
itemModal.addEventListener("click", event => {
  if (event.target === itemModal) closeItem();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeItem();
});

function refreshItemLists() {
  if (currentPage === "dashboardPage") renderRecentItems();
  if (currentPage === "searchPage") {
    renderSearchResults(document.getElementById("searchInput").value);
  }
}

document.getElementById("itemModalResolve").addEventListener("click", () => {
  if (!openedItem) return;
  const items = getItems();
  const target = items.find(item => item.id === openedItem.id);
  if (target) {
    target.resolved = true;
    saveItems(items);
  }
  closeItem();
  refreshItemLists();
  alert("Marked as found. The lost report has been removed.");
});

document.getElementById("itemModalCopy").addEventListener("click", async () => {
  if (!openedItem) return;
  const button = document.getElementById("itemModalCopy");
  const ok = await copyText(itemToText(openedItem));
  button.textContent = ok ? "✓ Copied" : "Select the text and press Ctrl+C";
  setTimeout(() => { button.textContent = "📋 Copy details"; }, 1800);
});

// DASHBOARD RECENT ITEMS
function renderRecentItems() {
  const container = document.getElementById("recentItems");
  container.replaceChildren();

  const items = getVisibleItems().slice(0, 4);

  if (items.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-message";
    message.textContent = "No items have been reported yet.";
    container.appendChild(message);
    return;
  }

  items.forEach(item => {
    container.appendChild(createItemCard(item));
  });
}

// SEARCH ITEMS
function renderSearchResults(searchTerm) {
  const container = document.getElementById("searchResults");
  container.replaceChildren();

  const term = searchTerm.toLowerCase();

  const filteredItems = getVisibleItems().filter(item =>
    item.name.toLowerCase().includes(term) ||
    (item.status || "Found").toLowerCase().includes(term) ||
    item.location.toLowerCase().includes(term) ||
    item.description.toLowerCase().includes(term)
  );

  if (filteredItems.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-message";
    message.textContent = "No matching items found.";
    container.appendChild(message);
    return;
  }

  filteredItems.forEach(item => {
    container.appendChild(createItemCard(item));
  });
}

document.getElementById("searchInput").addEventListener("input", event => {
  renderSearchResults(event.target.value);
});

// START: restore session if logged in, otherwise show login page
let savedUserId = null;
try { savedUserId = sessionStorage.getItem("campusCurrentUser"); } catch (e) {}

const savedUser = savedUserId
  ? getUsers().find(u => u.userId === savedUserId)
  : null;

if (savedUser) {
  startSession(savedUser);
} else {
  showPage("loginPage");
}

// The guide is opened after signup and during the first two successful logins.

