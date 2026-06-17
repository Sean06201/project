<template>
  <div class="app-shell">
    <header class="topbar">
      <button class="brand" @click="go('browse')">
        <span class="brand-mark">N</span>
        <span><strong>NotesBuddy</strong><small>校園共學平台</small></span>
      </button>
      <nav class="desktop-nav" aria-label="主要導覽">
        <button :class="{ active: view === 'browse' }" @click="go('browse')">探索資源</button>
        <button :class="{ active: view === 'share' }" @click="go('share')">分享筆記</button>
        <button :class="{ active: view === 'study' }" @click="go('study')">學習卡片</button>
        <button v-if="user" :class="{ active: view === 'profile' }" @click="go('profile')">我的空間</button>
        <button v-if="user?.role === 'admin'" :class="{ active: view === 'admin' }" @click="go('admin')">管理後台</button>
      </nav>
      <div class="account-actions">
        <template v-if="user">
          <span class="avatar">{{ user.display_name.slice(0, 1) }}</span>
          <button class="text-button desktop-only" @click="go('profile')">{{ user.display_name }}</button>
          <button class="outline-button" @click="logout">登出</button>
        </template>
        <template v-else>
          <button class="text-button" @click="openAuth('login')">登入</button>
          <button class="primary-button compact" @click="openAuth('register')">免費加入</button>
        </template>
      </div>
    </header>

    <main>
      <section v-if="view === 'browse'" class="browse-view">
        <div class="hero">
          <div class="hero-content">
            <span class="eyebrow">由同學打造，為同學而生</span>
            <h1>讓每一份好筆記，<br><em>都能幫到下一個人。</em></h1>
            <p>搜尋課堂筆記、考古題與精華整理，把時間留給真正重要的學習。</p>
            <form class="hero-search" @submit.prevent="search">
              <span>⌕</span>
              <input v-model="filters.q" aria-label="搜尋資源" placeholder="搜尋課程、教授或筆記關鍵字" />
              <button>搜尋</button>
            </form>
            <div class="hero-stats">
              <span><strong>{{ stats.notes }}</strong> 份資源</span>
              <span><strong>{{ stats.courses }}</strong> 門課程</span>
              <span><strong>{{ stats.members }}</strong> 位夥伴</span>
            </div>
          </div>
          <div class="hero-visual" aria-hidden="true">
            <div class="floating-card card-a"><b>微積分</b><span>期中考完整詳解</span><small>考古題</small></div>
            <div class="floating-card card-b"><b>網頁程式設計</b><span>期末專題重點整理</span><small>課堂筆記</small></div>
            <div class="orb"></div>
          </div>
        </div>

        <section class="content-section">
          <div class="section-heading">
            <div><span class="eyebrow dark">RESOURCE LIBRARY</span><h2>探索學習資源</h2></div>
            <button class="primary-button" @click="go('share')">＋ 分享一份資源</button>
          </div>
          <div class="filter-bar">
            <select v-model="filters.course_id" @change="search"><option value="">所有課程</option><option v-for="course in courses" :key="course.id" :value="course.id">{{ course.name }} · {{ course.professor }}</option></select>
            <select v-model="filters.type" @change="search"><option value="">所有類型</option><option>考古題</option><option>課堂筆記</option><option>精華總整理</option></select>
            <input v-model="filters.semester" @keyup.enter="search" placeholder="學期，例如 114-2" />
            <select v-model="filters.sort" @change="search"><option value="newest">最新上架</option><option value="oldest">最早上架</option><option value="title">標題排序</option></select>
            <button class="clear-button" @click="clearFilters">清除</button>
          </div>

          <div v-if="loading" class="state-card"><span class="loader"></span>正在整理資源…</div>
          <div v-else-if="!notes.length" class="state-card"><span class="empty-icon">⌕</span><h3>還沒有符合的資源</h3><p>換個關鍵字，或成為第一位分享的人。</p></div>
          <div v-else class="resource-grid">
            <article v-for="note in notes" :key="note.id" class="resource-card">
              <div class="card-topline">
                <span class="type-pill" :class="typeClass(note.type)">{{ note.type }}</span>
                <button class="icon-button" :class="{ saved: note.bookmarked }" :title="user ? '收藏' : '登入後收藏'" @click="toggleBookmark(note)">{{ note.bookmarked ? '♥' : '♡' }}</button>
              </div>
              <p class="course-label">{{ note.course_name }} · {{ note.professor }}</p>
              <h3>{{ note.title }}</h3>
              <p class="description">{{ note.description || '由同學分享的實用學習資源。' }}</p>
              <div class="meta-row"><span>◷ {{ note.semester }}</span><span>分享者 {{ note.contributor_name }}</span></div>
              <div class="card-actions">
                <a :href="note.link" target="_blank" rel="noopener noreferrer">開啟資源 ↗</a>
                <button v-if="user" @click="reportNote(note)">檢舉</button>
              </div>
            </article>
          </div>
          <div v-if="notePages > 1" class="pagination">
            <button :disabled="filters.page <= 1" @click="changePage(-1)">上一頁</button><span>{{ filters.page }} / {{ notePages }}</span><button :disabled="filters.page >= notePages" @click="changePage(1)">下一頁</button>
          </div>
        </section>
      </section>

      <section v-else-if="view === 'share'" class="page-wrap narrow">
        <button class="back-link" @click="go('browse')">← 回資源庫</button>
        <div class="page-intro"><span class="eyebrow dark">CONTRIBUTE</span><h1>{{ editingId ? '編輯你的資源' : '分享一份好資源' }}</h1><p>你的整理，可能正是另一位同學需要的那一盞燈。</p></div>
        <div v-if="!user" class="auth-gate"><div class="gate-icon">✦</div><h2>登入後即可分享</h2><p>建立免費帳號，記錄你的貢獻並管理已分享的內容。</p><button class="primary-button" @click="openAuth('register')">建立帳號</button></div>
        <form v-else class="panel form-grid" @submit.prevent="submitNote">
          <label><span>課程</span><select v-model="noteForm.course_id" required><option value="" disabled>選擇課程</option><option v-for="course in courses" :key="course.id" :value="course.id">{{ course.name }} · {{ course.professor }}</option></select></label>
          <label><span>學期</span><input v-model="noteForm.semester" maxlength="20" placeholder="114-2" required /></label>
          <label class="full"><span>資源標題</span><input v-model="noteForm.title" maxlength="120" placeholder="清楚描述這份資源的內容" required /></label>
          <label><span>資源類型</span><select v-model="noteForm.type"><option>考古題</option><option>課堂筆記</option><option>精華總整理</option></select></label>
          <label><span>雲端連結</span><input v-model="noteForm.link" type="url" placeholder="https://…" :required="!uploadFile" /></label>
          <label class="full"><span>或上傳檔案（PDF / 圖片，3MB 內）</span><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" @change="pickFile" /></label>
          <label class="full"><span>簡介</span><textarea v-model="noteForm.description" maxlength="500" rows="5" placeholder="說明內容、適用章節或使用方式"></textarea><small>{{ noteForm.description.length }}/500</small></label>
          <div class="full form-footer"><button v-if="editingId" type="button" class="outline-button" @click="resetNoteForm">取消編輯</button><button class="primary-button" :disabled="submitting">{{ submitting ? '處理中…' : editingId ? '儲存變更' : '發布資源' }}</button></div>
        </form>
      </section>

      <section v-else-if="view === 'study'" class="page-wrap">
        <div class="page-intro"><span class="eyebrow dark">QUICK REVIEW</span><h1>我的學習卡片</h1><p>把容易忘記的概念，變成每天都能快速複習的小卡片。</p></div>
        <div v-if="!user" class="auth-gate"><h2>登入後建立專屬卡片</h2><button class="primary-button" @click="openAuth('login')">登入</button></div>
        <template v-else>
          <form class="panel flash-form" @submit.prevent="createFlashcard"><select v-model="flashForm.course_id"><option value="">不指定課程</option><option v-for="course in courses" :key="course.id" :value="course.id">{{ course.name }}</option></select><input v-model="flashForm.front" placeholder="正面：問題或名詞" required /><input v-model="flashForm.back" placeholder="背面：答案或解釋" required /><button class="primary-button">新增卡片</button></form>
          <div v-if="!flashcards.length" class="state-card">還沒有卡片，先建立第一張吧。</div>
          <div class="flash-grid"><article v-for="card in flashcards" :key="card.id" class="flashcard" :class="{ flipped: flippedCards.has(card.id) }" @click="flip(card.id)"><small>{{ card.course_name || '個人卡片' }}</small><p>{{ flippedCards.has(card.id) ? card.back : card.front }}</p><span>{{ flippedCards.has(card.id) ? '答案' : '點一下看答案' }}</span><button @click.stop="deleteFlashcard(card.id)">刪除</button></article></div>
        </template>
      </section>

      <section v-else-if="view === 'profile'" class="page-wrap">
        <div class="profile-header panel"><div class="profile-avatar">{{ user?.display_name?.slice(0, 1) }}</div><div><span class="eyebrow dark">MY SPACE</span><h1>{{ user?.display_name }}</h1><p>{{ user?.email }}</p></div></div>
        <div class="stat-grid"><div><strong>{{ profile.stats?.contributions || 0 }}</strong><span>分享資源</span></div><div><strong>{{ profile.stats?.bookmarks || 0 }}</strong><span>收藏資源</span></div><div><strong>{{ profile.stats?.flashcards || 0 }}</strong><span>學習卡片</span></div></div>
        <div class="profile-tabs"><button :class="{ active: profileTab === 'mine' }" @click="loadProfileNotes('mine')">我的分享</button><button :class="{ active: profileTab === 'saved' }" @click="loadProfileNotes('saved')">我的收藏</button></div>
        <div class="resource-grid"><article v-for="note in profileNotes" :key="note.id" class="resource-card"><span class="type-pill" :class="typeClass(note.type)">{{ note.type }}</span><p class="course-label">{{ note.course_name }}</p><h3>{{ note.title }}</h3><p class="description">{{ note.description }}</p><div class="card-actions"><a :href="note.link" target="_blank" rel="noopener noreferrer">開啟</a><template v-if="profileTab === 'mine'"><button @click="editNote(note)">編輯</button><button class="danger-link" @click="deleteNote(note)">刪除</button></template></div></article></div>
      </section>

      <section v-else-if="view === 'admin'" class="page-wrap">
        <div class="page-intro"><span class="eyebrow dark">ADMIN CONSOLE</span><h1>內容管理後台</h1><p>查看檢舉、隱藏內容並建立資料庫備份。</p></div>
        <div class="admin-toolbar"><button class="primary-button" @click="backupDatabase">建立今日備份</button><button class="outline-button" @click="loadAdmin">重新整理</button></div>
        <div class="panel table-wrap"><table><thead><tr><th>資源</th><th>檢舉者</th><th>原因</th><th>狀態</th><th>操作</th></tr></thead><tbody><tr v-for="report in reports" :key="report.id"><td>{{ report.note_title }}</td><td>{{ report.reporter }}</td><td>{{ report.reason }}</td><td><span class="status-pill">{{ report.status }}</span></td><td><button @click="hideReportedNote(report)">隱藏內容</button><button @click="resolveReport(report)">結案</button></td></tr><tr v-if="!reports.length"><td colspan="5">目前沒有檢舉。</td></tr></tbody></table></div>
      </section>

      <section v-else-if="view === 'terms'" class="page-wrap narrow legal"><h1>平台使用規範</h1><p>NotesBuddy 用於同學間分享合法取得且有權分享的學習資料。請勿上傳侵害著作權、個人隱私或學校規範的內容。</p><h2>內容與帳號</h2><p>分享者需對內容負責；平台管理員可依檢舉或管理需要隱藏內容。請妥善保管帳號密碼。</p><h2>資料與服務</h2><p>平台會保存帳號、投稿、收藏與學習卡片等必要資料。服務可能因維護、免費方案休眠或雲端平台狀態而短暫中斷。</p></section>
    </main>

    <footer><div><strong>NotesBuddy</strong><span>一起把學習變得更輕鬆。</span></div><button @click="go('terms')">使用規範</button><span>© 2026 校園共學平台</span></footer>

    <div v-if="authOpen" class="modal-backdrop" @click.self="authOpen = false">
      <form class="auth-modal" @submit.prevent="submitAuth"><button type="button" class="modal-close" @click="authOpen = false">×</button><span class="brand-mark">N</span><h2>{{ authMode === 'login' ? '歡迎回來' : '加入 NotesBuddy' }}</h2><p>{{ authMode === 'login' ? '登入後收藏、分享與建立卡片。' : '建立免費帳號，開始你的共學旅程。' }}</p><label v-if="authMode === 'register'"><span>暱稱</span><input v-model="authForm.display_name" minlength="2" maxlength="40" required /></label><label><span>Email</span><input v-model="authForm.email" type="email" required /></label><label><span>密碼</span><input v-model="authForm.password" type="password" minlength="8" required /></label><label v-if="authMode === 'register'" class="admin-code"><span>管理員邀請碼（選填）</span><input v-model="authForm.admin_code" /></label><p v-if="authError" class="form-error">{{ authError }}</p><button class="primary-button full-button" :disabled="submitting">{{ submitting ? '請稍候…' : authMode === 'login' ? '登入' : '建立帳號' }}</button><button type="button" class="switch-auth" @click="switchAuth">{{ authMode === 'login' ? '還沒有帳號？立即註冊' : '已經有帳號？前往登入' }}</button></form>
    </div>
    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'

const view = ref('browse')
const user = ref(null)
const courses = ref([])
const notes = ref([])
const notePages = ref(1)
const loading = ref(false)
const submitting = ref(false)
const toast = ref('')
const stats = reactive({ notes: 0, courses: 0, members: 0 })
const filters = reactive({ q: '', course_id: '', type: '', semester: '', sort: 'newest', page: 1 })
const noteForm = reactive({ course_id: '', title: '', semester: '', type: '考古題', link: '', description: '' })
const editingId = ref(null)
const uploadFile = ref(null)
const authOpen = ref(false)
const authMode = ref('login')
const authError = ref('')
const authForm = reactive({ display_name: '', email: '', password: '', admin_code: '' })
const profile = reactive({ stats: {} })
const profileTab = ref('mine')
const profileNotes = ref([])
const flashcards = ref([])
const flashForm = reactive({ course_id: '', front: '', back: '' })
const flippedCards = ref(new Set())
const reports = ref([])

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || '操作失敗，請稍後再試')
  return data
}
function notify(message) { toast.value = message; window.setTimeout(() => { toast.value = '' }, 2600) }
function typeClass(type) { return type === '考古題' ? 'red' : type === '課堂筆記' ? 'blue' : 'amber' }
function go(target) { view.value = target; window.scrollTo({ top: 0, behavior: 'smooth' }); if (target === 'profile') loadProfile(); if (target === 'study') loadFlashcards(); if (target === 'admin') loadAdmin() }

async function loadBase() {
  const [courseData, statData, me] = await Promise.all([api('/api/courses'), api('/api/stats'), api('/api/auth/me')])
  courses.value = courseData; Object.assign(stats, statData); user.value = me.user
  await fetchNotes()
}
async function fetchNotes() {
  loading.value = true
  try {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ''))
    const data = await api(`/api/notes?${query}`); notes.value = data.items; notePages.value = data.pages
  } catch (error) { notify(error.message) } finally { loading.value = false }
}
function search() { filters.page = 1; fetchNotes() }
function clearFilters() { Object.assign(filters, { q: '', course_id: '', type: '', semester: '', sort: 'newest', page: 1 }); fetchNotes() }
function changePage(delta) { filters.page += delta; fetchNotes(); window.scrollTo({ top: 520, behavior: 'smooth' }) }

function openAuth(mode) { authMode.value = mode; authOpen.value = true; authError.value = '' }
function switchAuth() { authMode.value = authMode.value === 'login' ? 'register' : 'login'; authError.value = '' }
async function submitAuth() {
  submitting.value = true; authError.value = ''
  try {
    const data = await api(`/api/auth/${authMode.value}`, { method: 'POST', body: JSON.stringify(authForm) })
    user.value = data.user; authOpen.value = false; Object.assign(authForm, { display_name: '', email: '', password: '', admin_code: '' }); notify(`歡迎，${user.value.display_name}`); await loadBase()
  } catch (error) { authError.value = error.message } finally { submitting.value = false }
}
async function logout() { await api('/api/auth/logout', { method: 'POST' }); user.value = null; go('browse'); fetchNotes(); notify('已安全登出') }

function pickFile(event) { uploadFile.value = event.target.files?.[0] || null }
function fileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) }) }
async function submitNote() {
  submitting.value = true
  try {
    let link = noteForm.link
    if (uploadFile.value) {
      const data = await fileAsDataUrl(uploadFile.value)
      const uploaded = await api('/api/uploads', { method: 'POST', body: JSON.stringify({ mime: uploadFile.value.type, data }) })
      link = uploaded.url
    }
    const payload = { ...noteForm, link }
    await api(editingId.value ? `/api/notes/${editingId.value}` : '/api/notes', { method: editingId.value ? 'PUT' : 'POST', body: JSON.stringify(payload) })
    notify(editingId.value ? '變更已儲存' : '資源已發布，謝謝你的分享！'); resetNoteForm(); await loadBase(); go('browse')
  } catch (error) { notify(error.message) } finally { submitting.value = false }
}
function resetNoteForm() { Object.assign(noteForm, { course_id: '', title: '', semester: '', type: '考古題', link: '', description: '' }); editingId.value = null; uploadFile.value = null }
async function toggleBookmark(note) { if (!user.value) return openAuth('login'); try { const data = await api(`/api/notes/${note.id}/bookmark`, { method: 'POST' }); note.bookmarked = data.bookmarked ? 1 : 0; notify(data.bookmarked ? '已加入收藏' : '已取消收藏') } catch (error) { notify(error.message) } }
async function reportNote(note) { const reason = window.prompt(`檢舉「${note.title}」的原因：`); if (!reason) return; try { await api(`/api/notes/${note.id}/report`, { method: 'POST', body: JSON.stringify({ reason }) }); notify('已送出檢舉，管理員會進行查看') } catch (error) { notify(error.message) } }

async function loadProfile() { if (!user.value) return; const data = await api('/api/profile'); Object.assign(profile, data); await loadProfileNotes(profileTab.value) }
async function loadProfileNotes(tab) { profileTab.value = tab; const data = await api(`/api/notes?limit=24&${tab === 'mine' ? 'mine=1' : 'bookmarked=1'}`); profileNotes.value = data.items }
function editNote(note) { Object.assign(noteForm, { course_id: note.course_id, title: note.title, semester: note.semester, type: note.type, link: note.link, description: note.description || '' }); editingId.value = note.id; go('share') }
async function deleteNote(note) { if (!window.confirm(`確定刪除「${note.title}」？`)) return; await api(`/api/notes/${note.id}`, { method: 'DELETE' }); notify('資源已刪除'); loadProfile() }

async function loadFlashcards() { if (!user.value) return; flashcards.value = await api('/api/flashcards') }
async function createFlashcard() { try { await api('/api/flashcards', { method: 'POST', body: JSON.stringify(flashForm) }); Object.assign(flashForm, { course_id: '', front: '', back: '' }); notify('卡片已新增'); loadFlashcards() } catch (error) { notify(error.message) } }
function flip(id) { const next = new Set(flippedCards.value); next.has(id) ? next.delete(id) : next.add(id); flippedCards.value = next }
async function deleteFlashcard(id) { await api(`/api/flashcards/${id}`, { method: 'DELETE' }); loadFlashcards() }

async function loadAdmin() { if (user.value?.role !== 'admin') return; reports.value = await api('/api/admin/reports') }
async function hideReportedNote(report) { await api(`/api/admin/notes/${report.note_id}`, { method: 'PATCH', body: JSON.stringify({ status: 'hidden' }) }); await resolveReport(report); notify('內容已隱藏') }
async function resolveReport(report) { await api(`/api/admin/reports/${report.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) }); loadAdmin() }
async function backupDatabase() { const data = await api('/api/admin/backup', { method: 'POST' }); notify(`備份完成：${data.file}`) }

onMounted(() => loadBase().catch((error) => notify(error.message)))
</script>
