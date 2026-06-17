<template>
  <div id="app">
    <header class="navbar">
      <h1>🎓 校園考古題 / 筆記交流庫</h1>
      <p class="subtitle">資訊恆久遠，一站永流傳。學長姐的期末救星資源包！</p>
    </header>

    <main class="container">
      <section class="form-section">
        <h2>✍️ 分享我的考古題 / 筆記</h2>
        <form @submit.prevent="submitNote">
          <div class="form-group">
            <label>選擇科目/教授：</label>
            <select v-model="newNote.course_id" required>
              <option value="" disabled>-- 請選擇課程 --</option>
              <option v-for="course in courses" :key="course.id" :value="course.id">
                {{ course.name }} ({{ course.professor }} 教授)
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>資源標題：</label>
            <input type="text" v-model="newNote.title" placeholder="例如：114期末考大會考考古題" required />
          </div>

          <div class="form-group">
            <label>學年度學期：</label>
            <input type="text" v-model="newNote.semester" placeholder="例如：114-2" required />
          </div>

          <div class="form-group">
            <label>資源類型：</label>
            <select v-model="newNote.type" required>
              <option value="考古題">考古題</option>
              <option value="課堂筆記">課堂筆記</option>
              <option value="精華總整理">精華總整理</option>
            </select>
          </div>

          <div class="form-group">
            <label>雲端分享連結：</label>
            <input type="url" v-model="newNote.link" placeholder="請貼上 Google Drive 或 HackMD 連結" required />
          </div>

          <div class="form-group">
            <label>貢獻者暱稱：</label>
            <input type="text" v-model="newNote.contributor" placeholder="留空則顯示匿名學長姐" />
          </div>

          <button type="submit" class="btn-submit">🚀 立即無私分享</button>
        </form>
      </section>

      <section class="list-section">
        <h2>📚 目前已有的寶貴資源</h2>
        
        <div class="filter-group">
          <label>🔍 依課程快速篩選：</label>
          <select v-model="selectedCourse" @change="fetchNotes">
            <option value="">顯示全部課程</option>
            <option v-for="course in courses" :key="course.id" :value="course.id">
              {{ course.name }} ({{ course.professor }})
            </option>
          </select>
        </div>

        <div class="notes-grid">
          <div v-if="notes.length === 0" class="no-data">目前還沒有人分享這門課的資源，快來搶頭香！</div>
          
          <div v-for="note in notes" :key="note.id" class="note-card">
            <span class="card-tag" :class="note.type">{{ note.type }}</span>
            <h3>{{ note.title }}</h3>
            <p><strong>適用學期：</strong>{{ note.semester }}</p>
            <p><strong>課程名稱：</strong>{{ note.course_name }}</p>
            <p><strong>提供夥伴：</strong>{{ note.contributor }}</p>
            <a :href="note.link" target="_blank" class="btn-download">🔗 打開雲端下載資源</a>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';

export default {
  setup() {
    const courses = ref([]);
    const notes = ref([]);
    const selectedCourse = ref('');
    
    const newNote = ref({
      course_id: '',
      title: '',
      semester: '',
      type: '考古題',
      link: '',
      contributor: ''
    });

    const fetchCourses = async () => {
      try {
        const res = await fetch('/api/courses');
        courses.value = await res.json();
      } catch (err) {
        console.error('無法取得課程資料:', err);
      }
    };

    const fetchNotes = async () => {
      try {
        let url = '/api/notes';
        if (selectedCourse.value) {
          url += `?course_id=${selectedCourse.value}`;
        }
        const res = await fetch(url);
        notes.value = await res.json();
      } catch (err) {
        console.error('無法取得筆記資料:', err);
      }
    };

    const submitNote = async () => {
      try {
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newNote.value)
        });
        
        if (res.ok) {
          alert('✨ 感謝你的大愛！資源已成功收錄到資料庫。');
          newNote.value = {
            course_id: '',
            title: '',
            semester: '',
            type: '考古題',
            link: '',
            contributor: ''
          };
          fetchNotes();
        }
      } catch (err) {
        alert('上傳失敗，請確認後端 Node.js 是否正常啟動中。');
      }
    };

    onMounted(() => {
      fetchCourses();
      fetchNotes();
    });

    return {
      courses,
      notes,
      selectedCourse,
      newNote,
      fetchNotes,
      submitNote
    };
  }
};
</script>
