/**
 * Activity Calendar Block
 * Table: nb_crm_activities
 *
 * Displays CRM activities in a calendar view using FullCalendar.
 * Activity types: meeting, call, task, email, note
 */

// ==================== Load FullCalendar ====================

const coreMod = await ctx.importAsync('@fullcalendar/core@6.1.20');
const dayGridPlugin = await ctx.importAsync('@fullcalendar/daygrid@6.1.20');
const timeGridPlugin = await ctx.importAsync('@fullcalendar/timegrid@6.1.20');
const listPlugin = await ctx.importAsync('@fullcalendar/list@6.1.20');
const interactionModule = await ctx.importAsync('@fullcalendar/interaction@6.1.20');

const Calendar = coreMod.Calendar;
const interactionPlugin = interactionModule.default || interactionModule;

// ==================== Theme Detection ====================

const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm', ...opts });

// ==================== Config ====================

const TABLE_NAME = 'nb_crm_activities';

const VIEW_CONFIG = {
  detailPopup: '2a12swu8h87',   // Activity detail view
  addPopup: 'p4br2qxxr6f',      // Activity add form
};

// Monochrome + accent colors (theme-aware)
const ACTIVITY_COLORS = {
  meeting: { bg: T.colorBgLayout || '#f5f5f5', border: T.colorText || '#000', text: T.colorText || '#000' },
  call: { bg: T.colorSuccessBg || '#f6ffed', border: T.colorSuccess || '#52c41a', text: isDark ? (T.colorSuccess || '#52c41a') : '#389e0d' },
  task: { bg: T.colorWarningBg || '#fffbe6', border: T.colorWarning || '#faad14', text: isDark ? (T.colorWarning || '#faad14') : '#ad6800' },
  email: { bg: T.colorPrimaryBg || '#e6f7ff', border: T.colorPrimary || '#1890ff', text: isDark ? (T.colorPrimary || '#1890ff') : '#0958d9' },
  note: { bg: isDark ? 'rgba(114,46,209,0.15)' : '#f9f0ff', border: '#722ed1', text: isDark ? '#b37feb' : '#531dab' },
};

const ACTIVITY_LABELS = {
  meeting: t('Meeting'),
  call: t('Call'),
  task: t('Task'),
  email: t('Email'),
  note: t('Note'),
};

// ==================== Load Data ====================

// Filter options: 'pending' (default), 'all', 'upcoming'
const SHOW_MODE = 'pending'; // Only show incomplete activities

const loadActivities = async () => {
  try {
    // Calculate date range: 2 weeks ago to 4 weeks ahead
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const fourWeeksAhead = new Date();
    fourWeeksAhead.setDate(fourWeeksAhead.getDate() + 28);

    // Build filter based on mode
    let filter = {
      activity_date: {
        $gte: twoWeeksAgo.toISOString(),
        $lte: fourWeeksAhead.toISOString(),
      },
    };

    // For 'pending' mode, only show incomplete activities
    if (SHOW_MODE === 'pending') {
      filter.is_completed = false;
    }

    const res = await ctx.api.request({
      url: `${TABLE_NAME}:list`,
      params: {
        pageSize: 200,
        filter,
        appends: ['customer', 'contact', 'opportunity', 'owner'],
        sort: ['activity_date'],
      },
    });
    return res?.data?.data || [];
  } catch (err) {
    console.error('Failed to fetch activities:', err);
    return [];
  }
};

let activities = await loadActivities();

// ==================== Format Events ====================

const formatActivity = (a) => {
  const type = a.type || 'meeting';
  const colors = ACTIVITY_COLORS[type] || ACTIVITY_COLORS.meeting;
  const isPending = !a.is_completed;

  // Pending activities get solid colors, completed get muted
  const bgColor = isPending ? colors.bg : (T.colorBgLayout || '#fafafa');
  const borderColor = isPending ? colors.border : (T.colorBorderSecondary || '#e8e8e8');
  const textColor = isPending ? colors.text : (T.colorTextTertiary || '#999');

  // Add icon prefix for pending tasks
  const titlePrefix = isPending && type === 'task' ? '○ ' :
                      isPending && type === 'meeting' ? '◎ ' :
                      isPending && type === 'call' ? '◉ ' : '';

  return {
    id: String(a.id),
    title: titlePrefix + (a.subject || t('Untitled')),
    start: a.activity_date,
    end: a.duration ? new Date(new Date(a.activity_date).getTime() + a.duration * 60000).toISOString() : null,
    allDay: !a.duration,
    backgroundColor: bgColor,
    borderColor: borderColor,
    textColor: textColor,
    extendedProps: { type, activity: a, isPending },
  };
};

const formatAll = (items) => items.map(formatActivity);

// ==================== Create Container ====================

const wrapper = document.createElement('div');
wrapper.style.cssText = `padding: 16px; background: ${T.colorBgContainer || '#fff'}; border-radius: 8px;`;

// Add CSS - Minimalist antd style
const style = document.createElement('style');
style.textContent = `
  .activity-calendar .fc {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .activity-calendar .fc-toolbar-title {
    font-size: 16px !important;
    font-weight: 600 !important;
    color: ${T.colorText || '#000'} !important;
  }
  .activity-calendar .fc-button {
    padding: 4px 12px !important;
    font-size: 13px !important;
    border-radius: 6px !important;
    font-weight: 400 !important;
  }
  .activity-calendar .fc-button-primary {
    background: ${T.colorBgContainer || '#fff'} !important;
    border: 1px solid ${T.colorBorderSecondary || '#d9d9d9'} !important;
    color: ${T.colorText || 'rgba(0,0,0,0.88)'} !important;
  }
  .activity-calendar .fc-button-primary:hover {
    background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'} !important;
    color: ${T.colorText || '#000'} !important;
  }
  .activity-calendar .fc-button-primary:not(:disabled).fc-button-active,
  .activity-calendar .fc-button-primary:not(:disabled):active {
    background: ${T.colorPrimary || '#1890ff'} !important;
    border-color: ${T.colorPrimary || '#1890ff'} !important;
    color: #fff !important;
  }
  .activity-calendar .fc-theme-standard td,
  .activity-calendar .fc-theme-standard th {
    border-color: ${T.colorBorderSecondary || '#f0f0f0'};
  }
  .activity-calendar .fc-theme-standard .fc-scrollgrid {
    border-color: ${T.colorBorderSecondary || '#d9d9d9'};
  }
  .activity-calendar .fc-col-header-cell-cushion {
    color: ${T.colorTextSecondary || 'rgba(0,0,0,0.45)'};
    font-weight: 400;
    font-size: 12px;
  }
  .activity-calendar .fc-daygrid-day-number {
    font-size: 13px;
    color: ${T.colorText || 'rgba(0,0,0,0.88)'};
    padding: 4px 8px;
  }
  .activity-calendar .fc-daygrid-day.fc-day-today {
    background: ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'} !important;
  }
  .activity-calendar .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
    background: ${T.colorPrimary || '#1890ff'};
    color: #fff;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .activity-calendar .fc-event {
    border-radius: 4px !important;
    padding: 2px 6px !important;
    font-size: 11px !important;
    cursor: grab !important;
    margin: 1px 2px !important;
    border-left-width: 3px !important;
    border-left-style: solid !important;
    user-select: none;
  }
  .activity-calendar .fc-event:active {
    cursor: grabbing !important;
  }
  .activity-calendar .fc-event-dragging {
    opacity: 0.7;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .activity-calendar .fc-event-resizing {
    opacity: 0.8;
  }
  .activity-calendar .fc-daygrid-more-link {
    font-size: 11px;
    color: ${T.colorTextSecondary || 'rgba(0,0,0,0.45)'};
  }
  .activity-calendar .fc-list-event-title {
    font-size: 13px !important;
  }
  .activity-legend {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .activity-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: ${T.colorTextSecondary || 'rgba(0,0,0,0.65)'};
  }
  .activity-legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
`;
wrapper.appendChild(style);

// Header with filter info, legend and add button
const header = document.createElement('div');
header.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid ${T.colorBorderSecondary || '#f0f0f0'}; flex-wrap: wrap; gap: 12px;`;

// Left section: Title + Filter badge
const leftSection = document.createElement('div');
leftSection.style.cssText = 'display: flex; align-items: center; gap: 8px;';
leftSection.innerHTML = `
  <span style="font-size: 14px; font-weight: 500; color: ${T.colorText || '#000'};">${t('Activities')}</span>
  <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; background: ${SHOW_MODE === 'pending' ? (T.colorWarningBg || '#fff7e6') : (T.colorBgLayout || '#f5f5f5')}; color: ${SHOW_MODE === 'pending' ? (isDark ? (T.colorWarning || '#d46b08') : '#d46b08') : (T.colorTextSecondary || '#666')}; border: 1px solid ${SHOW_MODE === 'pending' ? (isDark ? (T.colorWarning || '#ffd591') : '#ffd591') : (T.colorBorderSecondary || '#d9d9d9')};">
    ${SHOW_MODE === 'pending' ? t('Pending Only') : t('All Activities')}
  </span>
`;
header.appendChild(leftSection);

// Right section: Legend + Add button
const rightSection = document.createElement('div');
rightSection.style.cssText = 'display: flex; align-items: center; gap: 16px; flex-wrap: wrap;';

// Legend
const legend = document.createElement('div');
legend.className = 'activity-legend';
legend.style.cssText = 'display: flex; gap: 16px; margin: 0; padding: 0; border: none; flex-wrap: wrap;';
legend.innerHTML = Object.entries(ACTIVITY_COLORS).map(([type, colors]) => `
  <div class="activity-legend-item">
    <div class="activity-legend-dot" style="background: ${colors.border}"></div>
    <span>${ACTIVITY_LABELS[type] || type}</span>
  </div>
`).join('');
rightSection.appendChild(legend);

// Refresh button
const refreshBtn = document.createElement('button');
refreshBtn.style.cssText = `display: flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 13px; border-radius: 6px; border: 1px solid ${T.colorBorderSecondary || '#d9d9d9'}; background: ${T.colorBgContainer || '#fff'}; color: ${T.colorTextSecondary || 'rgba(0,0,0,0.65)'}; cursor: pointer; transition: all 0.2s;`;
refreshBtn.innerHTML = `↻`;
refreshBtn.title = t('Refresh');
refreshBtn.onmouseenter = () => { refreshBtn.style.borderColor = T.colorPrimary || '#1890ff'; refreshBtn.style.color = T.colorPrimary || '#1890ff'; };
refreshBtn.onmouseleave = () => { refreshBtn.style.borderColor = T.colorBorderSecondary || '#d9d9d9'; refreshBtn.style.color = T.colorTextSecondary || 'rgba(0,0,0,0.65)'; };
refreshBtn.onclick = () => refreshCalendar();
rightSection.appendChild(refreshBtn);

// Add button
const addBtn = document.createElement('button');
addBtn.style.cssText = `display: flex; align-items: center; gap: 4px; padding: 4px 12px; font-size: 13px; border-radius: 6px; border: 1px solid ${T.colorPrimary || '#1890ff'}; background: ${T.colorPrimary || '#1890ff'}; color: #fff; cursor: pointer; transition: all 0.2s;`;
addBtn.innerHTML = `<span style="font-size: 14px;">+</span> ${t('Add')}`;
addBtn.onmouseenter = () => { addBtn.style.background = T.colorPrimaryHover || '#40a9ff'; addBtn.style.borderColor = T.colorPrimaryHover || '#40a9ff'; };
addBtn.onmouseleave = () => { addBtn.style.background = T.colorPrimary || '#1890ff'; addBtn.style.borderColor = T.colorPrimary || '#1890ff'; };
addBtn.onclick = async () => {
  const viewUid = VIEW_CONFIG.addPopup;
  if (!viewUid || viewUid.startsWith('REPLACE_WITH')) {
    ctx.message.warning(t('Add popup not configured'));
    return;
  }
  try {
    if (ctx.openView) {
      await ctx.openView(viewUid, {
        mode: 'drawer',
        size: 'medium',
      });
      // Refresh after closing
      setTimeout(refreshCalendar, 500);
    }
  } catch (err) {
    console.error('Failed to open add popup:', err);
    ctx.message.error(t('Failed to open add form'));
  }
};
rightSection.appendChild(addBtn);

header.appendChild(rightSection);
wrapper.appendChild(header);

// Calendar container
const calendarEl = document.createElement('div');
calendarEl.className = 'activity-calendar';
wrapper.appendChild(calendarEl);

ctx.element.innerHTML = '';
ctx.element.appendChild(wrapper);

// ==================== Refresh Function ====================

const refreshCalendar = async () => {
  activities = await loadActivities();
  calendar.removeAllEvents();
  calendar.addEventSource(formatAll(activities));
  ctx.message.success(t('Refreshed'));
};

// ==================== Initialize Calendar ====================

const calendar = new Calendar(calendarEl, {
  plugins: [
    dayGridPlugin.default || dayGridPlugin,
    timeGridPlugin.default || timeGridPlugin,
    listPlugin.default || listPlugin,
    interactionPlugin,
  ],
  initialView: 'dayGridMonth',
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,timeGridWeek,listWeek',
  },
  buttonText: {
    today: t('Today'),
    month: t('Month'),
    week: t('Week'),
    list: t('List'),
  },
  height: 'auto',
  dayMaxEvents: 3,
  events: formatAll(activities),

  // Enable drag & resize
  editable: true,
  eventStartEditable: true,
  eventDurationEditable: true,
  eventResizableFromStart: true,
  dragRevertDuration: 0,
  eventDragMinDistance: 5,

  // Click event - open detail popup
  eventClick: async (info) => {
    info.jsEvent.preventDefault();
    info.jsEvent.stopPropagation();

    const { activity } = info.event.extendedProps;
    if (!activity?.id) return;

    const viewUid = VIEW_CONFIG.detailPopup;
    if (!viewUid || viewUid.startsWith('REPLACE_WITH')) {
      ctx.message.warning(t('Detail popup not configured'));
      return;
    }

    try {
      if (ctx.openView) {
        await ctx.openView(viewUid, {
          mode: 'drawer',
          size: 'medium',
          filterByTk: activity.id,
        });
        // Refresh after closing
        setTimeout(refreshCalendar, 500);
      }
    } catch (err) {
      console.error('Failed to open detail popup:', err);
      ctx.message.error(t('Failed to open activity details'));
    }
  },

  // Event render - style based on pending status
  eventDidMount: (info) => {
    const { type, isPending } = info.event.extendedProps;
    const colors = ACTIVITY_COLORS[type] || ACTIVITY_COLORS.meeting;

    if (info.el) {
      if (isPending) {
        // Pending: use vibrant colors
        info.el.style.backgroundColor = colors.bg;
        info.el.style.borderColor = colors.border;
        info.el.style.color = colors.text;
        info.el.style.fontWeight = '500';
      } else {
        // Completed: muted style
        info.el.style.backgroundColor = T.colorBgLayout || '#fafafa';
        info.el.style.borderColor = T.colorBorderSecondary || '#e8e8e8';
        info.el.style.color = T.colorTextTertiary || '#999';
        info.el.style.textDecoration = 'line-through';
        info.el.style.opacity = '0.7';
      }
    }
  },

  // Drag event - update activity_date
  eventDrop: async (info) => {
    const { activity } = info.event.extendedProps;
    if (!activity?.id) return;

    const newStart = info.event.start;
    const newEnd = info.event.end;

    // Calculate new duration in minutes if end exists
    const duration = newEnd ? Math.round((newEnd - newStart) / 60000) : null;

    try {
      await ctx.api.request({
        url: `${TABLE_NAME}:update`,
        method: 'POST',
        params: { filterByTk: activity.id },
        data: {
          activity_date: newStart.toISOString(),
          ...(duration !== null && { duration }),
        },
      });
      ctx.message.success(t('Activity moved'));
    } catch (err) {
      console.error('Failed to update:', err);
      ctx.message.error(t('Failed to update'));
      info.revert();
    }
  },

  // Resize event - update duration
  eventResize: async (info) => {
    const { activity } = info.event.extendedProps;
    if (!activity?.id) return;

    const newStart = info.event.start;
    const newEnd = info.event.end;

    // Calculate new duration in minutes
    const duration = newEnd ? Math.round((newEnd - newStart) / 60000) : null;

    try {
      await ctx.api.request({
        url: `${TABLE_NAME}:update`,
        method: 'POST',
        params: { filterByTk: activity.id },
        data: {
          activity_date: newStart.toISOString(),
          ...(duration !== null && { duration }),
        },
      });
      ctx.message.success(t('Duration updated'));
    } catch (err) {
      console.error('Failed to update:', err);
      ctx.message.error(t('Failed to update'));
      info.revert();
    }
  },
});

calendar.render();
