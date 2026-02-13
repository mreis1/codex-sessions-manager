<script setup>
import { computed } from 'vue';

const props = defineProps({
  groupBy: {
    type: String,
    required: true,
  },
  groupOptions: {
    type: Array,
    required: true,
  },
  sessionsCount: {
    type: Number,
    default: 0,
  },
  showEmpty: {
    type: Boolean,
    default: false,
  },
  showOnlyEmpty: {
    type: Boolean,
    default: false,
  },
  cwdFilter: {
    type: String,
    default: '',
  },
  cwdFilterRegex: {
    type: Boolean,
    default: false,
  },
  emptySessionsCount: {
    type: Number,
    default: 0,
  },
  clearingEmpty: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'update:groupBy',
  'update:showEmpty',
  'update:showOnlyEmpty',
  'update:cwdFilter',
  'update:cwdFilterRegex',
  'refresh',
  'clear-empty',
]);

const groupModel = computed({
  get: () => props.groupBy,
  set: (value) => emit('update:groupBy', value),
});

const showEmptyModel = computed({
  get: () => props.showEmpty,
  set: (value) => emit('update:showEmpty', value),
});

const showOnlyEmptyModel = computed({
  get: () => props.showOnlyEmpty,
  set: (value) => emit('update:showOnlyEmpty', value),
});

const cwdFilterModel = computed({
  get: () => props.cwdFilter,
  set: (value) => emit('update:cwdFilter', value),
});

const cwdFilterRegexModel = computed({
  get: () => props.cwdFilterRegex,
  set: (value) => emit('update:cwdFilterRegex', value),
});
</script>

<template>
  <div class="header-sticky d-flex align-center justify-space-between flex-wrap px-4 px-md-6">
    <div>
      <h1 class="text-h4 font-weight-bold mb-1">Codex Sessions Manager</h1>
      <p class="text-body-2 text-medium-emphasis">
        Showcase of recorded coding agent sessions parsed from JSONL archives.
      </p>
    </div>
    <div class="d-flex align-center gap-3 flex-wrap">
      <v-text-field
        v-model="cwdFilterModel"
        density="compact"
        hide-details
        clearable
        variant="outlined"
        label="Filter by cwd"
        placeholder="e.g. codex-sessions-manager"
        class="cwd-filter"
      />
      <v-checkbox
        v-model="cwdFilterRegexModel"
        density="compact"
        hide-details
        label="Regex"
      />
      <v-btn-toggle
        v-model="groupModel"
        divided
        density="comfortable"
        class="group-toggle mr-3"
      >
        <v-btn
          v-for="option in groupOptions"
          :key="option.value"
          :value="option.value"
          variant="outlined"
        >
          {{ option.title }}
        </v-btn>
      </v-btn-toggle>
      <v-chip color="primary" variant="flat" class="text-body-2">
        {{ sessionsCount }} sessions
      </v-chip>
      <span class="flex flex-col">

        <v-checkbox
            v-model="showEmptyModel"
            density="compact"
            hide-details
            label="Show empty sessions"
            class="ml-2"
        />
        <v-checkbox
            v-model="showOnlyEmptyModel"
            density="compact"
            hide-details
            label="Show ONLY empty sessions"
            class="ml-2"
        />
      </span>
      <v-btn
        color="error"
        variant="flat"
        size="large"
        :disabled="!emptySessionsCount || clearingEmpty"
        :loading="clearingEmpty"
        class="ml-2"
        @click="emit('clear-empty')"
      >
        <v-icon size="18" class="mr-1" icon="mdi-broom"></v-icon>
        Clear empty ({{ emptySessionsCount }})
      </v-btn>
      <v-btn
        color="secondary"
        variant="flat"
        size="large"
        class="refresh-btn"
        @click="emit('refresh')"
      >
        <v-icon size="18" class="mr-1" icon="mdi-refresh"></v-icon>
        Refresh
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.header-sticky {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 16px 0 22px;
  margin: 0;
  background: rgba(232, 235, 240, 0.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}

.group-toggle {
  min-width: 260px;
}

.cwd-filter {
  min-width: 280px;
}

.refresh-btn {
  margin-left: 8px;
}
</style>
