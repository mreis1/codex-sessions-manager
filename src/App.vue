<script setup>
import { computed, ref, watch } from 'vue';
import ChatDialog from './components/ChatDialog.vue';
import SessionCard from './components/SessionCard.vue';
import SessionHeader from './components/SessionHeader.vue';
import { deleteSessionFiles, loadSessions } from './utils/sessionApi';
import { NO_REQUEST_TEXT, formatDate, formatDuration, parseSessions } from './utils/sessionParsing';
import { projectTone } from './utils/projectTone';

const rawSessionFiles = ref([]);
const clearingEmpty = ref(false);
const deletingSession = ref(false);

const showEmpty = ref(false);
const showOnlyEmpty = ref(false);
const cwdFilter = ref('');
const cwdFilterRegex = ref(false);

const parsedSessions = computed(() => parseSessions(rawSessionFiles.value));
const emptySessions = computed(() =>
  parsedSessions.value.filter((session) => session.firstRequest === NO_REQUEST_TEXT),
);
const emptySessionsCount = computed(() => emptySessions.value.length);

const sessions = computed(() => {
  let list = parsedSessions.value;
  if (showOnlyEmpty.value) {
    list = list.filter((session) => session.firstRequest === NO_REQUEST_TEXT);
  } else if (!showEmpty.value) {
    list = list.filter((session) => session.firstRequest !== NO_REQUEST_TEXT);
  }
  const rawQuery = String(cwdFilter.value || '');
  const query = rawQuery.trim().toLowerCase();
  if (query) {
    if (cwdFilterRegex.value) {
      try {
        const rx = new RegExp(rawQuery.trim(), 'i');
        list = list.filter((session) => rx.test(session.cwd || ''));
      } catch {
        list = [];
      }
    } else {
      list = list.filter((session) => (session.cwd || '').toLowerCase().includes(query));
    }
  }
  return list;
});

const sessionsList = computed(() => {
  const unique = new Map();
  sessions.value.forEach((s) => {
    const key = s.sessionId || s.id;
    const current = unique.get(key);
    if (!current) {
      unique.set(key, s);
      return;
    }
    const currentTime = new Date(current.lastMessageAt || current.createdAt || 0).getTime();
    const newTime = new Date(s.lastMessageAt || s.createdAt || 0).getTime();
    if (newTime > currentTime) {
      unique.set(key, s);
    }
  });
  return Array.from(unique.values());
});

const groupOptions = [
  { title: 'By project', value: 'project' },
  { title: 'By creation date', value: 'created' },
  { title: 'By last msg', value: 'last' },
  { title: 'No grouping', value: 'none' },
];

const GROUP_BY_STORAGE_KEY = 'codex.sessions.groupBy';
const CWD_FILTER_STORAGE_KEY = 'codex.sessions.cwdFilter';
const CWD_FILTER_REGEX_STORAGE_KEY = 'codex.sessions.cwdFilterRegex';
const groupBy = ref('project');

try {
  const stored = localStorage.getItem(GROUP_BY_STORAGE_KEY);
  if (stored && groupOptions.some((option) => option.value === stored)) {
    groupBy.value = stored;
  }
} catch (err) {
  console.warn('Failed to read groupBy from localStorage', err);
}

try {
  const storedCwdFilter = localStorage.getItem(CWD_FILTER_STORAGE_KEY);
  if (typeof storedCwdFilter === 'string') {
    cwdFilter.value = storedCwdFilter;
  }
  const storedCwdRegex = localStorage.getItem(CWD_FILTER_REGEX_STORAGE_KEY);
  if (storedCwdRegex === 'true' || storedCwdRegex === 'false') {
    cwdFilterRegex.value = storedCwdRegex === 'true';
  }
} catch (err) {
  console.warn('Failed to read cwd filter state from localStorage', err);
}

watch(groupBy, (value) => {
  try {
    localStorage.setItem(GROUP_BY_STORAGE_KEY, value);
  } catch (err) {
    console.warn('Failed to persist groupBy to localStorage', err);
  }
});

watch(cwdFilter, (value) => {
  try {
    localStorage.setItem(CWD_FILTER_STORAGE_KEY, value || '');
  } catch (err) {
    console.warn('Failed to persist cwdFilter to localStorage', err);
  }
});

watch(cwdFilterRegex, (value) => {
  try {
    localStorage.setItem(CWD_FILTER_REGEX_STORAGE_KEY, String(Boolean(value)));
  } catch (err) {
    console.warn('Failed to persist cwdFilterRegex to localStorage', err);
  }
});

const formatDay = (value) => {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const groupedSessions = computed(() => {
  const list = sessionsList.value;
  if (groupBy.value === 'none') {
    return [{ label: null, items: list }];
  }

  const map = new Map();
  list.forEach((session) => {
    let key;
    if (groupBy.value === 'project') {
      key = session.projectName || 'Unknown project';
    } else if (groupBy.value === 'last') {
      key = formatDay(session.lastMessageAt || session.createdAt);
    } else {
      key = formatDay(session.createdAt);
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(session);
  });

  let sorted;
  if (groupBy.value === 'created' || groupBy.value === 'last') {
    sorted = Array.from(map.entries()).sort((a, b) =>
      new Date(b[0]).getTime() - new Date(a[0]).getTime(),
    );
  } else {
    sorted = Array.from(map.entries()).sort((a, b) =>
      String(a[0]).localeCompare(String(b[0])),
    );
  }

  return sorted.map(([label, items]) => {
    const totalActiveMs = items.reduce((sum, session) => sum + (session.activeMs || 0), 0);
    const totalUserCommands = items.reduce(
      (sum, session) => sum + (session.userCommandCount || 0),
      0,
    );
    return {
      label,
      items,
      summary: {
        active: formatDuration(totalActiveMs),
        userCommands: totalUserCommands,
      },
    };
  });
});

const dialogSession = ref(null);
const dialogOpen = ref(false);

const refreshSessions = async () => {
  rawSessionFiles.value = await loadSessions();
};

refreshSessions();

const openSession = (session) => {
  dialogSession.value = session;
  dialogOpen.value = true;
};

const closeSession = () => {
  dialogOpen.value = false;
  dialogSession.value = null;
};

const copyResume = async (session) => {
  const cmd = `cd ${session.cwd} && codex resume ${session.sessionId}`;
  try {
    await navigator.clipboard.writeText(cmd);
  } catch (err) {
    console.warn('Clipboard copy failed', err);
  }
};

const copyNewSession = async (session) => {
  const cmd = `cd ${session.cwd} && codex`;
  try {
    await navigator.clipboard.writeText(cmd);
  } catch (err) {
    console.warn('Clipboard copy failed', err);
  }
};

const copyCwd = async (session) => {
  try {
    await navigator.clipboard.writeText(session.cwd || '');
  } catch (err) {
    console.warn('Clipboard copy failed', err);
  }
};

const deleteSession = async (session) => {
  if (deletingSession.value) return;
  const relPath = session?.relativePath || session?.fileName;
  if (!relPath) return;

  const shouldDelete = window.confirm(
    `Delete session file "${relPath}"? This cannot be undone.`,
  );
  if (!shouldDelete) return;

  deletingSession.value = true;
  try {
    const result = await deleteSessionFiles([relPath]);
    if (!result?.ok || (result.failed || []).length) {
      console.warn('Could not delete session file', result);
      return;
    }
    await refreshSessions();
  } finally {
    deletingSession.value = false;
  }
};

const clearEmptySessions = async () => {
  if (!emptySessionsCount.value || clearingEmpty.value) return;
  const shouldDelete = window.confirm(
    `Delete ${emptySessionsCount.value} empty session files? This cannot be undone.`,
  );
  if (!shouldDelete) return;

  const paths = Array.from(
    new Set(
      emptySessions.value
        .map((session) => session.relativePath || session.fileName)
        .filter(Boolean),
    ),
  );
  if (!paths.length) return;

  clearingEmpty.value = true;
  try {
    const result = await deleteSessionFiles(paths);
    if (!result?.ok || (result.failed || []).length) {
      console.warn('Some empty sessions could not be deleted', result);
    }
  } finally {
    await refreshSessions();
    clearingEmpty.value = false;
  }
};
</script>

<template>
  <v-app>
    <v-main>
      <v-container fluid class="pt-0 pb-6 px-0">
        <SessionHeader
          v-model:group-by="groupBy"
          v-model:show-empty="showEmpty"
          v-model:show-only-empty="showOnlyEmpty"
          v-model:cwd-filter="cwdFilter"
          v-model:cwd-filter-regex="cwdFilterRegex"
          :group-options="groupOptions"
          :sessions-count="sessions.length"
          :empty-sessions-count="emptySessionsCount"
          :clearing-empty="clearingEmpty"
          @clear-empty="clearEmptySessions"
          @refresh="refreshSessions"
        />

        <div class="page-pad">
          <div v-for="group in groupedSessions" :key="group.label || 'all'" class="mb-6">
            <div v-if="group.label" class="d-flex align-center mb-2">
              <div class="text-subtitle-1 font-weight-semibold text-medium-emphasis mr-2">
                {{ group.label }}
              </div>
              <div class="text-body-2 text-medium-emphasis mr-3">
                {{ group.summary.userCommands }} user cmds • {{ group.summary.active }} active
              </div>
              <v-spacer />
              <v-btn
                v-if="groupBy === 'project'"
                color="primary"
                variant="text"
                size="small"
                title="Copy to clipboard"
                @click="copyNewSession(group.items[0])"
              >
                <v-icon size="16" class="mr-1" icon="mdi-plus-circle-outline"></v-icon>
                New session cmd
              </v-btn>
            </div>
            <v-row dense>
              <v-col
                v-for="session in group.items"
                :key="session.id"
                cols="12"
                md="6"
                lg="4"
              >
                <SessionCard
                  :session="session"
                  :tone="projectTone(session.projectName)"
                  :format-date="formatDate"
                  @copy-resume="copyResume"
                  @delete-session="deleteSession"
                  @copy-cwd="copyCwd"
                  @open="openSession"
                />
              </v-col>
            </v-row>
          </div>

          <v-alert
            v-if="!sessions.length"
            type="info"
            variant="tonal"
            class="mt-4"
          >
            No session files found.
          </v-alert>
        </div>
      </v-container>

      <ChatDialog
        v-model="dialogOpen"
        :session="dialogSession"
        :format-date="formatDate"
        @copy-resume="copyResume"
        @close="closeSession"
      />
    </v-main>
  </v-app>
</template>

<style scoped>
.page-pad {
  padding: 28px 16px 0;
}

@media (min-width: 960px) {
  .page-pad {
    padding: 24px 24px 0;
  }
}

:global(.v-main) {
  padding-top: 0 !important;
}
</style>
