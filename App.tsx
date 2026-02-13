
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parse } from 'yaml';

type ViewKey = 'feed' | 'user' | 'profile' | 'dm';

type FeedViewerProfile = {
  name: string;
  avatar_char?: string;
  user_handle?: string;
  posts_count?: number;
  followers_count?: number;
  following_count?: number;
};

type FeedPostUser = {
  name: string;
  handle: string;
  avatar_icon?: string;
  avatar_bg?: string;
};

type FeedPostStats = {
  comments?: number;
  likes?: number;
  is_liked_by_viewer?: boolean;
};

type FeedPostReply = {
  from: string;
  to?: string;
  avatar?: string;
  text: string;
};

type FeedPostComment = {
  author: string;
  handle?: string;
  avatar?: string;
  text: string;
  replies?: FeedPostReply[];
};

type FeedPost = {
  user: FeedPostUser;
  body: string;
  tags?: string[];
  image_caption?: string;
  stats: FeedPostStats;
  people_comments?: FeedPostComment[];
};

type EchoChamberFeed = {
  viewer_profile?: FeedViewerProfile;
  posts?: FeedPost[];
  match_List?: { match: FeedPostUser }[];
};

type ProfileStats = {
  following?: number;
  followers?: number;
  likes_received?: number;
};

type ProfileUser = {
  name: string;
  handle: string;
  avatar_char?: string;
  avatar_icon?: string;
  avatar_bg?: string;
  signature?: string;
  bio?: string;
  banner_bg?: string;
  is_followed_by_viewer?: boolean;
  stats?: ProfileStats;
};

type ProfilePostStats = {
  comments?: number;
  likes?: number;
  is_liked_by_viewer?: boolean;
};

type ProfilePostComment = {
  comment_id?: string;
  user_name: string;
  avatar?: string;
  text: string;
};

type ProfilePost = {
  id: string;
  body: string;
  image_caption?: string;
  stats: ProfilePostStats;
  comments_data?: ProfilePostComment[];
};

type ProfileListItem = {
  name: string;
  handle: string;
  avatar_icon?: string;
  avatar_bg?: string;
};

type UserProfilePage = {
  profile_user?: ProfileUser;
  posts?: ProfilePost[];
  following_list?: ProfileListItem[];
  followers_list?: ProfileListItem[];
};

type DMParticipant = {
  name: string;
  handle: string;
  avatar_char?: string;
  avatar_icon?: string;
  avatar_bg?: string;
};

type DMMessage = {
  sender_handle: string;
  content: string;
  is_read?: boolean;
  timestamp?: string;
};

type DirectMessageThread = {
  participants?: {
    viewer?: DMParticipant;
    chat_partner?: DMParticipant;
  };
  messages?: DMMessage[];
};

type RootData = {
  echo_chamber_feed?: EchoChamberFeed;
  user_profile_page?: UserProfilePage;
  direct_message_thread?: DirectMessageThread;
};

type NpcChatRecord = {
  key: string;
  updated_at: number;
  messages: DMMessage[];
};

type NpcChatExportPayload = {
  version: number;
  exported_at: number;
  chats: NpcChatRecord[];
};

const NPC_DB_NAME = 'echo_chamber';
const NPC_DB_VERSION = 1;
const NPC_STORE_NAME = 'npc_chats';

const openNpcChatDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(NPC_DB_NAME, NPC_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NPC_STORE_NAME)) {
        db.createObjectStore(NPC_STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readNpcChat = async (key: string): Promise<NpcChatRecord | null> => {
  const db = await openNpcChatDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NPC_STORE_NAME, 'readonly');
    const store = tx.objectStore(NPC_STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as NpcChatRecord) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
};

const listNpcChats = async (): Promise<NpcChatRecord[]> => {
  const db = await openNpcChatDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NPC_STORE_NAME, 'readonly');
    const store = tx.objectStore(NPC_STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as NpcChatRecord[]) ?? []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
};

const writeNpcChat = async (key: string, messages: DMMessage[]) => {
  const db = await openNpcChatDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NPC_STORE_NAME, 'readwrite');
    const store = tx.objectStore(NPC_STORE_NAME);
    store.put({ key, updated_at: Date.now(), messages });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const deleteNpcChat = async (key: string) => {
  const db = await openNpcChatDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NPC_STORE_NAME, 'readwrite');
    const store = tx.objectStore(NPC_STORE_NAME);
    store.delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const normalizeNpcChatRecord = (input: unknown): NpcChatRecord | null => {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const key = String(record.key ?? record.npc_key ?? '').trim();
  if (!key) return null;
  const rawMessages = Array.isArray(record.messages) ? record.messages : [];
  const messages = rawMessages
    .map((message) => {
      const item = message as Record<string, unknown>;
      const sender = String(item.sender_handle ?? '');
      const content = String(item.content ?? '');
      if (!sender || !content) return null;
      return {
        sender_handle: sender,
        content,
        is_read: typeof item.is_read === 'boolean' ? item.is_read : undefined,
        timestamp: typeof item.timestamp === 'string' ? item.timestamp : undefined,
      } satisfies DMMessage;
    })
    .filter((item): item is DMMessage => !!item);
  return {
    key,
    updated_at: Number(record.updated_at ?? Date.now()),
    messages,
  };
};

const parseYamlSource = (source: string): RootData => {
  try {
    return (parse(source) as RootData) ?? {};
  } catch {
    // ignore, try JSON
  }
  try {
    return (JSON.parse(source) as RootData) ?? {};
  } catch {
    // ignore, try loose JSON
  }
  try {
    const relaxed = source.replace(/,\s*(\}|\])/g, '$1');
    return (JSON.parse(relaxed) as RootData) ?? {};
  } catch (error) {
    console.error('Failed to parse structured data:', error);
    return {};
  }
};

const resolveMacroString = (value: string) => {
  if (typeof substitudeMacros !== 'function') return value;
  try {
    return substitudeMacros(value);
  } catch (error) {
    console.warn('Failed to resolve macros:', error);
    return value;
  }
};

const resolveMacrosDeep = (value: unknown): unknown => {
  if (typeof value === 'string') return resolveMacroString(value);
  if (Array.isArray(value)) return value.map((item) => resolveMacrosDeep(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveMacrosDeep(item)]),
    );
  }
  return value;
};

const normalizeEchoChamberFeed = (feed: EchoChamberFeed): EchoChamberFeed => {
  if (!feed.posts) return feed;
  const normalizedPosts = feed.posts.map((post) => {
    const record = post as FeedPost & { People_comments?: FeedPostComment[] };
    if (!record.people_comments && record.People_comments) {
      return {
        ...record,
        people_comments: record.People_comments,
      };
    }
    return post;
  });
  return {
    ...feed,
    posts: normalizedPosts,
  };
};

const isRootData = (value: unknown): value is RootData => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    'echo_chamber_feed' in record || 'user_profile_page' in record || 'direct_message_thread' in record
  );
};

const isEchoChamberFeed = (value: unknown): value is EchoChamberFeed => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return 'viewer_profile' in record || 'posts' in record;
};

const coerceEchoChamberFeed = (value: unknown): EchoChamberFeed | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = parseYamlSource(value);
    if (isRootData(parsed)) return parsed.echo_chamber_feed ?? null;
    if (isEchoChamberFeed(parsed)) return parsed;
    return null;
  }
  if (typeof value === 'object') {
    if (isEchoChamberFeed(value)) return value as EchoChamberFeed;
  }
  return null;
};

const coerceRootData = (value: unknown): RootData | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = parseYamlSource(value);
    return coerceRootData(parsed);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (isRootData(record)) {
      const feed = coerceEchoChamberFeed(record.echo_chamber_feed);
      return {
        echo_chamber_feed: feed ?? (record.echo_chamber_feed as EchoChamberFeed | undefined),
        user_profile_page: record.user_profile_page as UserProfilePage | undefined,
        direct_message_thread: record.direct_message_thread as DirectMessageThread | undefined,
      };
    }
    if (record.echo_chamber) {
      const nested = coerceRootData(record.echo_chamber);
      if (nested) return nested;
    }
    if (isEchoChamberFeed(record)) {
      return { echo_chamber_feed: record as EchoChamberFeed };
    }
  }
  return null;
};

const readEchoChamberVariables = (): RootData | null => {
  try {
    if (typeof Mvu !== 'undefined' && typeof getCurrentMessageId === 'function') {
      const variables = Mvu.getMvuData({ type: 'message', message_id: getCurrentMessageId() });
      const statData = _.get(variables, 'stat_data');
      const fromStat = coerceRootData(_.get(statData, 'echo_chamber') ?? statData);
      if (fromStat) return fromStat;
    }
  } catch (error) {
    console.warn('Failed to read MVU data:', error);
  }

  if (typeof getVariables === 'function') {
    const scopes: VariableOption[] = [];
    if (typeof getCurrentMessageId === 'function') {
      scopes.push({ type: 'message', message_id: getCurrentMessageId() });
    }
    scopes.push({ type: 'chat' }, { type: 'character' }, { type: 'global' });
    for (const scope of scopes) {
      try {
        const vars = getVariables(scope);
        const statData = _.get(vars, 'stat_data');
        const statRoot = coerceRootData(_.get(statData, 'echo_chamber') ?? statData);
        if (statRoot) return statRoot;
        const statFeed = coerceEchoChamberFeed(_.get(statData, 'echo_chamber_feed'));
        if (statFeed) return { echo_chamber_feed: statFeed };
        const direct = coerceRootData(vars);
        if (direct) return direct;
        const nested = coerceRootData(_.get(vars, 'echo_chamber'));
        if (nested) return nested;
        const feedOnly = coerceEchoChamberFeed(_.get(vars, 'echo_chamber_feed'));
        if (feedOnly) return { echo_chamber_feed: feedOnly };
      } catch (error) {
        console.warn('Failed to read variables:', error);
      }
    }
  }

  return null;
};

const updateStatData = async (
  apply: (statData: Record<string, unknown>) => void,
  refresh: () => void,
): Promise<void> => {
  const option: VariableOption =
    typeof getCurrentMessageId === 'function'
      ? { type: 'message', message_id: getCurrentMessageId() }
      : { type: 'message', message_id: 'latest' };

  const updateWithVars = (vars: Record<string, unknown>) => {
    const next = _.cloneDeep(vars ?? {});
    const statData = (_.get(next, 'stat_data') as Record<string, unknown>) ?? {};
    apply(statData);
    _.set(next, 'stat_data', statData);
    return next;
  };

  try {
    if (typeof waitGlobalInitialized === 'function') {
      await waitGlobalInitialized('Mvu');
    }
  } catch (error) {
    console.warn('Failed waiting for MVU:', error);
  }

  try {
    if (typeof Mvu !== 'undefined' && typeof Mvu.getMvuData === 'function') {
      const vars = (Mvu.getMvuData(option) as Record<string, unknown>) ?? {};
      const next = updateWithVars(vars);
      await Mvu.replaceMvuData(next, option);
      refresh();
      return;
    }
  } catch (error) {
    console.warn('Failed to update MVU data:', error);
  }

  try {
    if (typeof getVariables === 'function' && typeof replaceVariables === 'function') {
      const vars = (getVariables(option) as Record<string, unknown>) ?? {};
      const next = updateWithVars(vars);
      replaceVariables(next, option);
      refresh();
    }
  } catch (error) {
    console.warn('Failed to update variables:', error);
  }
};

const getInitialChar = (value?: string, fallback = '？') => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed[0] : fallback;
};
const App: React.FC = () => {
  const [data, setData] = useState<RootData>({});

  const refreshData = useCallback(() => {
    const variableData = readEchoChamberVariables();
    if (!variableData) return;
    const next = resolveMacrosDeep(variableData) as RootData;
    if (next.echo_chamber_feed) {
      next.echo_chamber_feed = normalizeEchoChamberFeed(next.echo_chamber_feed);
    }
    setData(next);
  }, []);

  const feedData: EchoChamberFeed = data.echo_chamber_feed ?? {};
  const userPageData: UserProfilePage = data.user_profile_page ?? {};
  const dmData: DirectMessageThread = data.direct_message_thread ?? {};

  const feedViewer: FeedViewerProfile = feedData.viewer_profile ?? {
    name: '访客',
    avatar_char: '访',
    user_handle: '@user',
    posts_count: 0,
    followers_count: 0,
    following_count: 0,
  };
  const matchList = useMemo(
    () =>
      (feedData.match_List ?? [])
        .map((item) => item.match)
        .filter((item): item is FeedPostUser => !!item && typeof item.handle === 'string'),
    [feedData.match_List],
  );
  const isViewerComment = useCallback(
    (comment?: FeedPostComment | null) => {
      if (!comment) return false;
      if (feedViewer.user_handle && comment.handle) {
        return comment.handle === feedViewer.user_handle;
      }
      return comment.author === feedViewer.name;
    },
    [feedViewer.name, feedViewer.user_handle],
  );
  const isViewerReply = useCallback(
    (reply?: FeedPostReply | null) => (reply ? reply.from === feedViewer.name : false),
    [feedViewer.name],
  );

  const profileUser: ProfileUser = userPageData.profile_user ?? {
    name: '未知用户',
    handle: '@unknown',
    avatar_char: '？',
    avatar_icon: '？',
    avatar_bg: 'linear-gradient(135deg,#88f,#f88)',
    signature: '还没有签名',
    bio: '还没有简介。',
    banner_bg: 'linear-gradient(135deg,#a18cd1,#fbc2eb)',
    is_followed_by_viewer: false,
    stats: { following: 0, followers: 0, likes_received: 0 },
  };

  const dmViewer: DMParticipant = dmData.participants?.viewer ?? {
    name: '你',
    handle: '@you',
    avatar_char: '你',
    avatar_icon: '你',
  };

  const dmPartner: DMParticipant = dmData.participants?.chat_partner ?? {
    name: '',
    handle: '',
    avatar_char: '',
    avatar_icon: '',
    avatar_bg: '',
  };

  const [activeView, setActiveView] = useState<ViewKey>('feed');
  const [dmPartnerOverride, setDmPartnerOverride] = useState<DMParticipant | null>(null);
  const [dmBackTarget, setDmBackTarget] = useState<ViewKey>('profile');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [themeDark, setThemeDark] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [feedPosts, setFeedPosts] = useState<FeedPost[]>(() => feedData.posts ?? []);
  const [feedOpenComments, setFeedOpenComments] = useState<Record<number, boolean>>({});
  const [feedReplyInputs, setFeedReplyInputs] = useState<Record<number, string>>({});
  const [feedReplyTargets, setFeedReplyTargets] = useState<Record<number, 'post' | number>>({});

  const [userPosts, setUserPosts] = useState<ProfilePost[]>(() => userPageData.posts ?? []);
  const [userOpenComments, setUserOpenComments] = useState<Record<number, boolean>>({});
  const [userSignature, setUserSignature] = useState(profileUser.signature ?? '');
  const [drawerMode, setDrawerMode] = useState<'following' | 'followers' | null>(null);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [newPostBody, setNewPostBody] = useState('');
  const [newPostImage, setNewPostImage] = useState('');

  const [profileFollowed, setProfileFollowed] = useState(!!profileUser.is_followed_by_viewer);
  const [profileFollowerCount, setProfileFollowerCount] = useState(profileUser.stats?.followers ?? 0);

  const [dmMessages, setDmMessages] = useState<DMMessage[]>(() => dmData.messages ?? []);
  const [dmStagedMessages, setDmStagedMessages] = useState<string[]>([]);
  const [dmInput, setDmInput] = useState('');
  const dmImportInputRef = useRef<HTMLInputElement | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatApiAvailable, setChatApiAvailable] = useState(true);
  const [isChatSending, setIsChatSending] = useState(false);
  const chatStreamRef = useRef<HTMLDivElement>(null);
  const chatSyncTimerRef = useRef<number | null>(null);
  const activeDmPartner = dmPartnerOverride ?? dmPartner;
  const hasActivePartner = Boolean(activeDmPartner.handle || activeDmPartner.name);
  const dmKey = useMemo(
    () => activeDmPartner.handle || activeDmPartner.name || '',
    [activeDmPartner.handle, activeDmPartner.name],
  );
  useEffect(() => {
    document.body.classList.toggle('theme-dark', themeDark);
    return () => {
      document.body.classList.remove('theme-dark');
    };
  }, [themeDark]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    setFeedPosts(data.echo_chamber_feed?.posts ?? []);
    setFeedOpenComments({});
    setFeedReplyInputs({});
    setFeedReplyTargets({});
  }, [data.echo_chamber_feed]);

  useEffect(() => {
    setUserPosts(data.user_profile_page?.posts ?? []);
    setUserOpenComments({});
    setUserSignature(data.user_profile_page?.profile_user?.signature ?? '');
    setProfileFollowed(!!data.user_profile_page?.profile_user?.is_followed_by_viewer);
    setProfileFollowerCount(data.user_profile_page?.profile_user?.stats?.followers ?? 0);
  }, [data.user_profile_page]);

  useEffect(() => {
    setDmMessages(data.direct_message_thread?.messages ?? []);
  }, [data.direct_message_thread]);

  useEffect(() => {
    let cancelled = false;
    if (!dmKey) return undefined;
    const load = async () => {
      try {
        const record = await readNpcChat(dmKey);
        if (cancelled || !record?.messages?.length) return;
        setDmMessages((current) => {
          const base = data.direct_message_thread?.messages ?? current;
          return record.messages.length > base.length ? record.messages : base;
        });
      } catch (error) {
        console.warn('Failed to load NPC chat:', error);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [dmKey, data.direct_message_thread?.messages]);

  useEffect(() => {
    if (!dmKey) return;
    const timer = window.setTimeout(() => {
      void writeNpcChat(dmKey, dmMessages).catch((error) => {
        console.warn('Failed to persist NPC chat:', error);
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [dmKey, dmMessages]);

  useEffect(() => {
    let stopped = false;
    let handler: EventOnReturn | null = null;

    const bindMvu = async () => {
      if (typeof waitGlobalInitialized !== 'function' || typeof eventOn !== 'function') return;
      try {
        await waitGlobalInitialized('Mvu');
        if (stopped || typeof Mvu === 'undefined') return;
        refreshData();
        if (Mvu?.events?.VARIABLE_UPDATE_ENDED) {
          handler = eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, () => refreshData());
        }
      } catch (error) {
        console.warn('Failed to bind MVU listener:', error);
      }
    };

    void bindMvu();
    return () => {
      stopped = true;
      handler?.stop();
    };
  }, [refreshData]);

  useEffect(() => {
    if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') return undefined;
    const events = [
      tavern_events.CHAT_CHANGED,
      tavern_events.MESSAGE_SENT,
      tavern_events.MESSAGE_RECEIVED,
      tavern_events.MESSAGE_UPDATED,
      tavern_events.MESSAGE_SWIPED,
    ];
    const handlers = events.map((evt) => eventOn(evt, () => refreshData()));
    return () => {
      handlers.forEach((item) => item.stop());
    };
  }, [refreshData]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('is-fullscreen', isFullscreen);
    return () => {
      document.body.classList.remove('is-fullscreen');
    };
  }, [isFullscreen]);

  const loadChatMessages = useCallback(() => {
    if (typeof getChatMessages !== 'function') {
      setChatApiAvailable(false);
      setChatMessages([]);
      return;
    }
    setChatApiAvailable(true);
    try {
      const messages = getChatMessages('0-{{lastMessageId}}', { hide_state: 'unhidden' }) ?? [];
      setChatMessages(messages);
    } catch (error) {
      console.warn('Failed to load chat messages:', error);
      setChatMessages([]);
    }
  }, []);

  const scheduleChatSync = useCallback(() => {
    if (chatSyncTimerRef.current !== null) return;
    chatSyncTimerRef.current = window.setTimeout(() => {
      chatSyncTimerRef.current = null;
      loadChatMessages();
    }, 80);
  }, [loadChatMessages]);

  useEffect(() => {
    loadChatMessages();
  }, [loadChatMessages]);

  useEffect(() => {
    if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') {
      return;
    }
    const events = [
      tavern_events.MESSAGE_SENT,
      tavern_events.MESSAGE_RECEIVED,
      tavern_events.MESSAGE_EDITED,
      tavern_events.MESSAGE_DELETED,
      tavern_events.MESSAGE_UPDATED,
      tavern_events.MESSAGE_SWIPED,
      tavern_events.MORE_MESSAGES_LOADED,
      tavern_events.CHAT_CHANGED,
      tavern_events.USER_MESSAGE_RENDERED,
      tavern_events.CHARACTER_MESSAGE_RENDERED,
    ];
    const handlers = events.map((evt) => eventOn(evt, scheduleChatSync));
    return () => {
      handlers.forEach((handler) => handler.stop());
    };
  }, [scheduleChatSync]);

  useEffect(() => {
    const stream = chatStreamRef.current;
    if (!stream) return;
    stream.scrollTop = stream.scrollHeight;
  }, [chatMessages]);

  const handleFullscreenToggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((error) => {
        console.error('Error attempting to enable fullscreen:', error);
      });
      return;
    }
    if (document.exitFullscreen) {
      document.exitFullscreen().catch((error) => {
        console.error('Error attempting to exit fullscreen:', error);
      });
    }
  };

  const handleExportNpcChats = async () => {
    try {
      const chats = await listNpcChats();
      const payload: NpcChatExportPayload = {
        version: 1,
        exported_at: Date.now(),
        chats,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `echo_chamber_npc_chats_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn('Failed to export NPC chats:', error);
    }
  };

  const handleDeleteNpcChat = async () => {
    if (!dmKey) return;
    const name = activeDmPartner.name || dmKey;
    if (!window.confirm(`确定清空与「${name}」的聊天记录吗？`)) return;
    try {
      await deleteNpcChat(dmKey);
      setDmMessages(data.direct_message_thread?.messages ?? []);
      setDmStagedMessages([]);
      setDmInput('');
    } catch (error) {
      console.warn('Failed to delete NPC chat:', error);
    }
  };

  const handleImportNpcChatsFile: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as NpcChatExportPayload | NpcChatRecord[];
      const list = Array.isArray(parsed) ? parsed : parsed?.chats ?? [];
      const normalized = list
        .map((item) => normalizeNpcChatRecord(item))
        .filter((item): item is NpcChatRecord => !!item);
      await Promise.all(normalized.map((item) => writeNpcChat(item.key, item.messages)));
      const current = normalized.find((item) => item.key === dmKey);
      if (current) setDmMessages(current.messages);
    } catch (error) {
      console.warn('Failed to import NPC chats:', error);
    }
  };

  const handleSendChat = async () => {
    if (isChatSending) return;
    const content = chatInput.trim();
    if (!content) return;

    setChatInput('');
    setIsChatSending(true);

    try {
      if (typeof createChatMessages === 'function') {
        try {
          await createChatMessages([{ role: 'user', message: content }], {
            insert_before: 'end',
            refresh: 'affected',
          });
        } catch (error) {
          console.warn('Failed to send message to tavern:', error);
        }
      }

      if (typeof generate === 'function') {
        try {
          const response = await generate({ user_input: content });
          if (typeof response === 'string' && response.trim() && typeof createChatMessages === 'function') {
            await createChatMessages([{ role: 'assistant', message: response }], {
              insert_before: 'end',
              refresh: 'affected',
            });
          }
        } catch (error) {
          console.warn('Failed to generate response:', error);
        }
      }
    } finally {
      setIsChatSending(false);
      scheduleChatSync();
    }
  };

  const handleFeedReplySend = (postIndex: number) => {
    const content = (feedReplyInputs[postIndex] ?? '').trim();
    if (!content) return;
    const post = feedPosts[postIndex];
    if (!post) return;
    const peopleComments = post.people_comments ?? [];
    const target = feedReplyTargets[postIndex] ?? 'post';
    const targetIndex = typeof target === 'number' ? target : null;
    if (targetIndex !== null && !peopleComments[targetIndex]) return;

    const reply: FeedPostReply = {
      from: feedViewer.name,
      to: targetIndex !== null ? peopleComments[targetIndex]?.author : post.user.name,
      avatar: feedViewer.avatar_char ?? getInitialChar(feedViewer.name, ''),
      text: content,
    };
    const newComment: FeedPostComment = {
      author: feedViewer.name,
      handle: feedViewer.user_handle,
      avatar: feedViewer.avatar_char ?? getInitialChar(feedViewer.name, ''),
      text: content,
      replies: [],
    };

    setFeedPosts((prev) =>
      prev.map((item, idx) => {
        if (idx !== postIndex) return item;
        const nextComments =
          targetIndex !== null
            ? (item.people_comments ?? []).map((comment, commentIdx) => {
                if (commentIdx !== targetIndex) return comment;
                return {
                  ...comment,
                  replies: [...(comment.replies ?? []), reply],
                };
              })
            : [...(item.people_comments ?? []), newComment];
        return {
          ...item,
          people_comments: nextComments,
          stats: {
            ...item.stats,
            comments: (item.stats.comments ?? 0) + 1,
          },
        };
      }),
    );

    setFeedReplyInputs((prev) => ({ ...prev, [postIndex]: '' }));

    void updateStatData(
      (statData) => {
        const basePath = `echo_chamber_feed.posts.${postIndex}`;
        if (targetIndex === null) {
          const commentsPath = `${basePath}.people_comments`;
          const comments = (_.get(statData, commentsPath) as FeedPostComment[]) ?? [];
          comments.push(newComment);
          _.set(statData, commentsPath, comments);
        } else {
          const repliesPath = `${basePath}.people_comments.${targetIndex}.replies`;
          const replies = (_.get(statData, repliesPath) as FeedPostReply[]) ?? [];
          replies.push(reply);
          _.set(statData, repliesPath, replies);
        }
        _.update(statData, `${basePath}.stats.comments`, (value) => Number(value ?? 0) + 1);
      },
      refreshData,
    );
  };

  const handleDeleteFeedComment = (postIndex: number, commentIndex: number) => {
    const post = feedPosts[postIndex];
    if (!post) return;
    const comments = post.people_comments ?? [];
    const targetComment = comments[commentIndex];
    if (!targetComment) return;
    const removedCount = 1 + (targetComment.replies?.length ?? 0);

    setFeedPosts((prev) =>
      prev.map((item, idx) => {
        if (idx !== postIndex) return item;
        const nextComments = (item.people_comments ?? []).filter((_, idx2) => idx2 !== commentIndex);
        return {
          ...item,
          people_comments: nextComments,
          stats: {
            ...item.stats,
            comments: Math.max(0, (item.stats.comments ?? 0) - removedCount),
          },
        };
      }),
    );

    void updateStatData(
      (statData) => {
        const basePath = `echo_chamber_feed.posts.${postIndex}`;
        const commentsPath = `${basePath}.people_comments`;
        const comments = (_.get(statData, commentsPath) as FeedPostComment[]) ?? [];
        comments.splice(commentIndex, 1);
        _.set(statData, commentsPath, comments);
        _.update(statData, `${basePath}.stats.comments`, (value) =>
          Math.max(0, Number(value ?? 0) - removedCount),
        );
      },
      refreshData,
    );
  };

  const handleDeleteFeedReply = (postIndex: number, commentIndex: number, replyIndex: number) => {
    const post = feedPosts[postIndex];
    if (!post) return;
    const comment = post.people_comments?.[commentIndex];
    if (!comment?.replies?.[replyIndex]) return;

    setFeedPosts((prev) =>
      prev.map((item, idx) => {
        if (idx !== postIndex) return item;
        const nextComments = (item.people_comments ?? []).map((itemComment, idx2) => {
          if (idx2 !== commentIndex) return itemComment;
          const nextReplies = (itemComment.replies ?? []).filter((_, idx3) => idx3 !== replyIndex);
          return { ...itemComment, replies: nextReplies };
        });
        return {
          ...item,
          people_comments: nextComments,
          stats: {
            ...item.stats,
            comments: Math.max(0, (item.stats.comments ?? 0) - 1),
          },
        };
      }),
    );

    void updateStatData(
      (statData) => {
        const basePath = `echo_chamber_feed.posts.${postIndex}`;
        const repliesPath = `${basePath}.people_comments.${commentIndex}.replies`;
        const replies = (_.get(statData, repliesPath) as FeedPostReply[]) ?? [];
        replies.splice(replyIndex, 1);
        _.set(statData, repliesPath, replies);
        _.update(statData, `${basePath}.stats.comments`, (value) => Math.max(0, Number(value ?? 0) - 1));
      },
      refreshData,
    );
  };
  const toggleFeedLike = (index: number) => {
    setFeedPosts((prev) =>
      prev.map((post, idx) => {
        if (idx !== index) return post;
        const isLiked = post.stats.is_liked_by_viewer ?? false;
        const likes = post.stats.likes ?? 0;
        return {
          ...post,
          stats: {
            ...post.stats,
            is_liked_by_viewer: !isLiked,
            likes: Math.max(0, isLiked ? likes - 1 : likes + 1),
          },
        };
      }),
    );
    void updateStatData(
      (statData) => {
        const path = `echo_chamber_feed.posts.${index}.stats`;
        const stats = (_.get(statData, path) as FeedPostStats) ?? {};
        const isLiked = !!stats.is_liked_by_viewer;
        const likes = Number(stats.likes ?? 0);
        _.set(statData, path, {
          ...stats,
          is_liked_by_viewer: !isLiked,
          likes: Math.max(0, isLiked ? likes - 1 : likes + 1),
        });
      },
      refreshData,
    );
  };

  const toggleUserLike = (index: number) => {
    setUserPosts((prev) =>
      prev.map((post, idx) => {
        if (idx !== index) return post;
        const isLiked = post.stats.is_liked_by_viewer ?? false;
        const likes = post.stats.likes ?? 0;
        return {
          ...post,
          stats: {
            ...post.stats,
            is_liked_by_viewer: !isLiked,
            likes: Math.max(0, isLiked ? likes - 1 : likes + 1),
          },
        };
      }),
    );
    void updateStatData(
      (statData) => {
        const path = `user_profile_page.posts.${index}.stats`;
        const stats = (_.get(statData, path) as ProfilePostStats) ?? {};
        const isLiked = !!stats.is_liked_by_viewer;
        const likes = Number(stats.likes ?? 0);
        _.set(statData, path, {
          ...stats,
          is_liked_by_viewer: !isLiked,
          likes: Math.max(0, isLiked ? likes - 1 : likes + 1),
        });
      },
      refreshData,
    );
  };

  const toggleProfileLike = (index: number) => {
    setUserPosts((prev) =>
      prev.map((post, idx) => {
        if (idx !== index) return post;
        const isLiked = post.stats.is_liked_by_viewer ?? false;
        const likes = post.stats.likes ?? 0;
        return {
          ...post,
          stats: {
            ...post.stats,
            is_liked_by_viewer: !isLiked,
            likes: Math.max(0, isLiked ? likes - 1 : likes + 1),
          },
        };
      }),
    );
    void updateStatData(
      (statData) => {
        const path = `user_profile_page.posts.${index}.stats`;
        const stats = (_.get(statData, path) as ProfilePostStats) ?? {};
        const isLiked = !!stats.is_liked_by_viewer;
        const likes = Number(stats.likes ?? 0);
        _.set(statData, path, {
          ...stats,
          is_liked_by_viewer: !isLiked,
          likes: Math.max(0, isLiked ? likes - 1 : likes + 1),
        });
      },
      refreshData,
    );
  };

  const openDm = (fromView: ViewKey, partner?: DMParticipant | null) => {
    setDmBackTarget(fromView);
    setDmPartnerOverride(partner ?? null);
    setActiveView('dm');
  };

  const handleEditSignature = () => {
    const next = window.prompt('修改签名：', userSignature);
    if (next === null) return;
    setUserSignature(next.trim());
  };

  const handleNewPostSubmit = () => {
    const body = newPostBody.trim();
    if (!body) return;
    const imageCaption = newPostImage.trim();
    const newPost: ProfilePost = {
      id: `local-${Date.now()}`,
      body,
      image_caption: imageCaption || undefined,
      stats: { comments: 0, likes: 0, is_liked_by_viewer: false },
      comments_data: [],
    };
    setUserPosts((prev) => [newPost, ...prev]);
    setNewPostBody('');
    setNewPostImage('');
    setPostModalOpen(false);
  };

  const handleDeletePost = (postId: string) => {
    setUserPosts((prev) => prev.filter((post) => post.id !== postId));
  };

  const handleProfileFollowToggle = () => {
    setProfileFollowed((prev) => {
      setProfileFollowerCount((count) => Math.max(0, count + (prev ? -1 : 1)));
      return !prev;
    });
  };

  const handleStageMessage = () => {
    const content = dmInput.trim();
    if (!content) return;
    setDmStagedMessages((prev) => [...prev, content]);
    setDmInput('');
  };

  const handleSendAllMessages = () => {
    const content = dmInput.trim();
    const payload = [...dmStagedMessages, ...(content ? [content] : [])];
    if (payload.length === 0) return;
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    setDmMessages((prev) => [
      ...prev,
      ...payload.map((msg) => ({
        sender_handle: dmViewer.handle,
        content: msg,
        is_read: false,
        timestamp,
      })),
    ]);
    setDmInput('');
    setDmStagedMessages([]);
  };

  const handleDmKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      handleStageMessage();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const content = dmInput.trim();
      if (!content) return;
      const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      setDmMessages((prev) => [
        ...prev,
        { sender_handle: dmViewer.handle, content, is_read: false, timestamp },
      ]);
      setDmInput('');
    }
  };

  const feedViewClasses = `view view-feed ${activeView === 'feed' ? 'active' : ''}`;
  const userViewClasses = `view view-user ${activeView === 'user' ? 'active' : ''}`;
  const profileViewClasses = `view view-profile ${activeView === 'profile' ? 'active' : ''}`;
  const dmViewClasses = `view view-dm ${activeView === 'dm' ? 'active' : ''}`;

  const drawerList = drawerMode === 'following' ? userPageData.following_list ?? [] : userPageData.followers_list ?? [];
  const drawerTitle = drawerMode === 'following' ? '正在关注' : '关注者';

  return (
    <div className="echo-root">
      <div className="background-layer" />

      <div className="app-shell">
        <section className="main-panel">
          <header className="main-header">
            <div className="main-title">回声室 · 叙事区</div>
            <button className="fullscreen-btn" type="button" onClick={handleFullscreenToggle}>
              {isFullscreen ? '退出全屏' : '全屏'}
            </button>
          </header>
          <div ref={chatStreamRef} className="chat-stream">
            {!chatApiAvailable && <div className="chat-empty">未检测到酒馆聊天 API，当前仅展示静态界面。</div>}
            {chatApiAvailable && chatMessages.length === 0 && <div className="chat-empty">暂无聊天内容。</div>}
            {chatApiAvailable &&
              chatMessages.map((msg) => (
                <div
                  key={`${msg.message_id}-${msg.role}`}
                  className={`chat-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}
                >
                  {msg.message}
                </div>
              ))}
          </div>
          <div className="input-bar">
            <input
              type="text"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSendChat();
                }
              }}
              placeholder={isChatSending ? '响应中…' : '输入内容…'}
              disabled={isChatSending}
            />
            {isChatSending && <span className="input-status">响应中…</span>}
            <button
              type="button"
              className={`send-btn ${isChatSending ? 'sending' : ''}`}
              onClick={() => void handleSendChat()}
              disabled={isChatSending}
            >
              <span className={`send-icon ${isChatSending ? 'spinner' : ''}`} aria-hidden="true">
                {!isChatSending ? '→' : ''}
              </span>
              <span className="send-text">{isChatSending ? '响应中' : '发送'}</span>
            </button>
          </div>
        </section>

        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-header">
            <div className="sidebar-title">回声室模块</div>
            <button
              className="sidebar-toggle"
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
            >
              {sidebarCollapsed ? '展开' : '收起'}
            </button>
          </div>
          <div className="echo-module">
            <section className={feedViewClasses} data-view="feed">
              <div className="phone-screen">
                <header className="app-header">
                  <button
                    type="button"
                    className="header-btn user-avatar-btn"
                    onClick={() => setActiveView('user')}
                  >
                    <div className="user-avatar">{feedViewer.avatar_char ?? getInitialChar(feedViewer.name)}</div>
                  </button>
                  <p className="title-custom">回声室</p>
                  <div className="header-actions">
                    <button
                      type="button"
                      className="header-btn header-icon-btn"
                      onClick={() => {
                        const keyword = window.prompt('请输入搜索关键词：', '');
                        if (keyword && keyword.trim()) console.info(`搜索：${keyword.trim()}`);
                      }}
                    >
                      <svg viewBox="0 0 24 24">
                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path>
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="header-btn header-icon-btn"
                      onClick={() => console.info('刷新首页')}
                    >
                      <svg viewBox="0 0 24 24">
                        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path>
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="header-btn header-icon-btn theme-toggle-btn"
                      title="切换日/夜"
                      onClick={() => setThemeDark((prev) => !prev)}
                    >
                      <svg viewBox="0 0 24 24">
                        <path d="M21 14.5A7.5 7.5 0 0 1 9.5 3a9 9 0 1 0 11.5 11.5z"></path>
                      </svg>
                    </button>
                  </div>
                </header>

                <main className="feed-post-stream">
                  {feedPosts.map((post, index) => (
                    <article key={`${post.user.handle}-${index}`} className="post-card">
                      <header className="post-header" onClick={() => setActiveView('profile')}>
                        <div
                          className="post-avatar"
                          style={{ background: post.user.avatar_bg ?? 'linear-gradient(135deg,#88f,#f88)' }}
                        >
                          {post.user.avatar_icon ?? getInitialChar(post.user.name)}
                        </div>
                        <div className="post-user-info">
                          <span className="post-user-name">{post.user.name}</span>
                          <span className="post-user-handle">{post.user.handle}</span>
                        </div>
                      </header>
                      <p className="post-body">{post.body}</p>
                      {post.tags && post.tags.length > 0 && (
                        <div className="post-tags">
                          {post.tags.map((tag) => (
                            <span key={tag} className="tag-item">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {post.image_caption && (
                        <figure className="post-photo">
                          <figcaption>{post.image_caption}</figcaption>
                        </figure>
                      )}
                      <footer className="post-footer">
                        <button
                          type="button"
                          className="footer-action"
                          onClick={() => {
                            setFeedOpenComments((prev) => ({ ...prev, [index]: !prev[index] }));
                            setFeedReplyTargets((prev) => ({ ...prev, [index]: 'post' }));
                          }}
                        >
                          <svg viewBox="0 0 24 24">
                            <path d="M14.046 2.242l-4.148-.01h-.002c-4.374 0-7.8 3.427-7.8 7.802 0 4.098 3.186 7.206 7.465 7.37v3.828c0 .108.044.286.12.403.142.225.384.347.632.347.138 0 .277-.038.402-.118.264-.168 6.473-4.14 8.088-5.506 1.902-1.61 3.04-3.97 3.043-6.312v-.017c-.006-4.367-3.43-7.787-7.8-7.788zm3.787 12.972c-1.134.96-4.862 3.405-6.772 4.643V16.67c.615.033 1.22.048 1.81.048 3.456 0 6.262-2.806 6.262-6.262 0-1.556-.56-2.96-1.5-4.064 1.248 1.39 1.953 3.13 1.953 5.013v.002c0 1.96-1.022 3.85-2.755 5.16z"></path>
                          </svg>
                          <span className="comment-count-display">{post.stats.comments ?? 0}</span>
                        </button>
                        <button
                          type="button"
                          className={`footer-action ${post.stats.is_liked_by_viewer ? 'liked' : ''}`}
                          onClick={() => toggleFeedLike(index)}
                        >
                          <svg viewBox="0 0 24 24">
                            <path d="M12 21.638h-.014C9.403 21.59 1.95 14.856 1.95 8.478c0-3.064 2.525-5.754 5.403-5.754 2.29 0 3.83 1.58 4.646 2.73.814-1.148 2.354-2.73 4.645-2.73 2.88 0 5.404 2.69 5.404 5.755 0 6.376-7.454 13.11-10.037 13.157H12z"></path>
                          </svg>
                          <span className="like-count">{post.stats.likes ?? 0}</span>
                        </button>
                      </footer>
                      <div
                        className="comment-section"
                        style={{ display: feedOpenComments[index] ? 'block' : 'none' }}
                      >
                        <div className="comments-list">
                          {(post.people_comments ?? []).map((comment, commentIndex) => (
                            <div key={`${comment.author}-${commentIndex}`} className="comment-item">
                              <div className="comment-avatar">{comment.avatar ?? getInitialChar(comment.author)}</div>
                              <div className="comment-content">
                                <div className="comment-user-info-container">
                                  <span className="comment-user-name">{comment.author}</span>
                                  {isViewerComment(comment) && (
                                    <button
                                      type="button"
                                      className="comment-delete-btn"
                                      onClick={() => handleDeleteFeedComment(index, commentIndex)}
                                    >
                                      删除
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="comment-reply-btn"
                                    onClick={() =>
                                      setFeedReplyTargets((prev) => ({ ...prev, [index]: commentIndex }))
                                    }
                                  >
                                    回复
                                  </button>
                                </div>
                                <span className="comment-text">{comment.text}</span>
                                {comment.replies && comment.replies.length > 0 && (
                                  <div className="replies-container">
                                    {comment.replies.map((reply, replyIndex) => (
                                      <div key={`${reply.from}-${replyIndex}`} className="reply-item">
                                        <div className="reply-avatar">{reply.avatar ?? getInitialChar(reply.from)}</div>
                                        <div className="reply-content">
                                          <div className="reply-user-info-container">
                                            <span className="reply-user-name">
                                              {reply.from}
                                              {reply.to && (
                                                <span className="reply-to-tag">回复 {reply.to}</span>
                                              )}
                                            </span>
                                            {isViewerReply(reply) && (
                                              <button
                                                type="button"
                                                className="reply-delete-btn"
                                                onClick={() =>
                                                  handleDeleteFeedReply(index, commentIndex, replyIndex)
                                                }
                                              >
                                                删除
                                              </button>
                                            )}
                                          </div>
                                          <span className="reply-text">{reply.text}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="comment-input-area">
                          <textarea
                            className="comment-input"
                            placeholder={
                              (feedReplyTargets[index] ?? 'post') === 'post'
                                ? `评论 ${post.user.name}…`
                                : `回复 ${post.people_comments?.[
                                    feedReplyTargets[index] as number
                                  ]?.author ?? '评论'}…`
                            }
                            rows={1}
                            value={feedReplyInputs[index] ?? ''}
                            onChange={(event) =>
                              setFeedReplyInputs((prev) => ({ ...prev, [index]: event.target.value }))
                            }
                          ></textarea>
                          <button type="button" className="comment-send-btn" onClick={() => handleFeedReplySend(index)}>
                            发送
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </main>
              </div>
            </section>
            <section className={userViewClasses} data-view="user">
              <div className="phone-screen">
                <header className="profile-header">
                  <div className="header-bg">
                    <button className="back-btn" onClick={() => setActiveView('feed')}>
                      <svg viewBox="0 0 24 24">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path>
                      </svg>
                    </button>
                  </div>
                  <div className="profile-main-info">
                    <div className="profile-avatar-wrapper">
                      <div
                        className="profile-avatar"
                        style={{ background: profileUser.avatar_bg ?? 'linear-gradient(135deg,#88f,#f88)' }}
                      >
                        {feedViewer.avatar_char ??
                          profileUser.avatar_char ??
                          profileUser.avatar_icon ??
                          getInitialChar(feedViewer.name ?? profileUser.name)}
                      </div>
                    </div>
                    <h1 className="profile-name">{feedViewer.name ?? profileUser.name}</h1>
                    <p className="profile-handle">{feedViewer.user_handle ?? ''}</p>
                    <div className="profile-signature" onClick={handleEditSignature}>
                      <span>{userSignature || '点击编辑签名'}</span>
                      <svg className="edit-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path>
                      </svg>
                    </div>
                  </div>
                  <div className="profile-stats">
                    <div className="stat-item">
                      <span className="stat-value">{feedViewer.posts_count ?? userPosts.length}</span>
                      <span className="stat-label">动态</span>
                    </div>
                    <div className="stat-item" onClick={() => setDrawerMode('following')}>
                      <span className="stat-value">
                        {feedViewer.following_count ?? profileUser.stats?.following ?? 0}
                      </span>
                      <span className="stat-label">正在关注</span>
                    </div>
                    <div className="stat-item" onClick={() => setDrawerMode('followers')}>
                      <span className="stat-value">
                        {feedViewer.followers_count ?? profileUser.stats?.followers ?? 0}
                      </span>
                      <span className="stat-label">关注者</span>
                    </div>
                  </div>
                  <div className="profile-actions">
                    <button className="action-btn" onClick={() => openDm('user')}>
                      私信
                    </button>
                  </div>
                </header>

                <main className="profile-content">
                  {userPosts.map((post, index) => (
                    <article key={post.id} className="post-card" data-post-id={post.id}>
                      <header className="post-header">
                        <div className="post-header-info">
                          <div
                            className="post-avatar"
                            style={{ background: profileUser.avatar_bg ?? 'linear-gradient(135deg,#88f,#f88)' }}
                          >
                            {profileUser.avatar_char ?? getInitialChar(profileUser.name)}
                          </div>
                          <div className="post-user-info">
                            <span className="post-user-name">{profileUser.name}</span>
                            <span className="post-user-handle">{profileUser.handle}</span>
                          </div>
                        </div>
                        <button
                          className="delete-post-btn"
                          type="button"
                          onClick={() => handleDeletePost(post.id)}
                          title="删除动态"
                        >
                          <svg viewBox="0 0 24 24">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path>
                          </svg>
                        </button>
                      </header>
                      <p className="post-body">{post.body}</p>
                      {post.image_caption && (
                        <figure className="post-photo">
                          <figcaption>{post.image_caption}</figcaption>
                        </figure>
                      )}
                      <footer className="post-footer">
                        <button
                          type="button"
                          className="footer-action"
                          onClick={() =>
                            setUserOpenComments((prev) => ({ ...prev, [index]: !prev[index] }))
                          }
                        >
                          <svg viewBox="0 0 24 24">
                            <path d="M14.046 2.242l-4.148-.01h-.002c-4.374 0-7.8 3.427-7.8 7.802 0 4.098 3.186 7.206 7.465 7.37v3.828c0 .108.044.286.12.403.142.225.384.347.632.347.138 0 .277-.038.402-.118.264-.168 6.473-4.14 8.088-5.506 1.902-1.61 3.04-3.97 3.043-6.312v-.017c-.006-4.367-3.43-7.787-7.8-7.788zm3.787 12.972c-1.134.96-4.862 3.405-6.772 4.643V16.67c.615.033 1.22.048 1.81.048 3.456 0 6.262-2.806 6.262-6.262 0-1.556-.56-2.96-1.5-4.064 1.248 1.39 1.953 3.13 1.953 5.013v.002c0 1.96-1.022 3.85-2.755 5.16z"></path>
                          </svg>
                          <span className="comment-count-display">{post.stats.comments ?? 0}</span>
                        </button>
                        <button
                          type="button"
                          className={`footer-action ${post.stats.is_liked_by_viewer ? 'liked' : ''}`}
                          onClick={() => toggleUserLike(index)}
                        >
                          <svg viewBox="0 0 24 24">
                            <path d="M12 21.638h-.014C9.403 21.59 1.95 14.856 1.95 8.478c0-3.064 2.525-5.754 5.403-5.754 2.29 0 3.83 1.58 4.646 2.73.814-1.148 2.354-2.73 4.645-2.73 2.88 0 5.404 2.69 5.404 5.755 0 6.376-7.454 13.11-10.037 13.157H12z"></path>
                          </svg>
                          <span className="like-count">{post.stats.likes ?? 0}</span>
                        </button>
                      </footer>
                      <div
                        className="comment-section"
                        style={{ display: userOpenComments[index] ? 'block' : 'none' }}
                      >
                        <div className="comments-list">
                          {(post.comments_data ?? []).map((comment, commentIndex) => (
                            <div key={`${comment.user_name}-${commentIndex}`} className="comment-item">
                              <div className="comment-avatar">{comment.avatar ?? getInitialChar(comment.user_name)}</div>
                              <div className="comment-content">
                                <div className="comment-user-info-container">
                                  <span className="comment-user-name">{comment.user_name}</span>
                                  <button type="button" className="comment-reply-btn">
                                    回复
                                  </button>
                                </div>
                                <span className="comment-text">{comment.text}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="comment-input-area">
                          <textarea className="comment-input" placeholder="添加评论" rows={1}></textarea>
                          <button type="button" className="comment-send-btn">
                            发送
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </main>

                <button className="new-post-btn" type="button" onClick={() => setPostModalOpen(true)}>
                  +
                </button>
              </div>

              <div
                className={`drawer-overlay ${drawerMode ? 'active' : ''}`}
                onClick={(event) => {
                  if (event.target === event.currentTarget) setDrawerMode(null);
                }}
              >
                <div className="drawer-content">
                  <h3 className="drawer-header">{drawerTitle}</h3>
                  <div className="drawer-body">
                    {drawerList.length === 0 && (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        还没有任何{drawerTitle}哦
                      </div>
                    )}
                    {drawerList.map((item) => (
                      <div
                        key={item.handle}
                        className="list-item"
                        onClick={() => {
                          setActiveView('profile');
                          setDrawerMode(null);
                        }}
                      >
                        <div
                          className="item-avatar"
                          style={{
                            background: item.avatar_bg ?? 'linear-gradient(135deg, #88f, #f88)',
                            color: 'white',
                          }}
                        >
                          {item.avatar_icon ?? getInitialChar(item.name)}
                        </div>
                        <div className="list-item-main">
                          <div className="list-item-header">
                            <span className="item-name">{item.name}</span>
                          </div>
                          <div className="list-item-body">
                            <span className="last-message">{item.handle}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`modal-overlay ${postModalOpen ? 'active' : ''}`}>
                <div className="modal-content">
                  <h3>创建新动态</h3>
                  <textarea
                    value={newPostBody}
                    onChange={(event) => setNewPostBody(event.target.value)}
                    placeholder="分享点什么新鲜事？"
                  ></textarea>
                  <input
                    type="text"
                    value={newPostImage}
                    onChange={(event) => setNewPostImage(event.target.value)}
                    placeholder="图片描述 (选填)"
                  />
                  <div className="modal-actions">
                    <button className="modal-btn cancel" type="button" onClick={() => setPostModalOpen(false)}>
                      取消
                    </button>
                    <button className="modal-btn submit" type="button" onClick={handleNewPostSubmit}>
                      发布
                    </button>
                  </div>
                </div>
              </div>
            </section>
            <section className={profileViewClasses} data-view="profile">
              <div className="phone-screen">
                <button type="button" className="back-btn" onClick={() => setActiveView('feed')} title="退出">
                  ←
                </button>
                <div className="profile-page-container">
                  <header className="profile-page-header">
                    <div
                      className="profile-banner"
                      style={{
                        background: profileUser.banner_bg ?? 'linear-gradient(135deg,#a18cd1,#fbc2eb)',
                      }}
                    ></div>
                    <div className="profile-main-info">
                      <div className="profile-avatar-container">
                        <div
                          className="profile-avatar-large"
                          style={{ background: profileUser.avatar_bg ?? 'linear-gradient(135deg,#88f,#f88)' }}
                        >
                          {profileUser.avatar_icon ?? profileUser.avatar_char ?? getInitialChar(profileUser.name)}
                        </div>
                        <div className="profile-actions">
                          <button
                            type="button"
                            className={`action-btn follow ${profileFollowed ? 'followed' : ''}`}
                            onClick={handleProfileFollowToggle}
                          >
                            {profileFollowed ? '已关注' : '＋ 关注'}
                          </button>
                          <button type="button" className="action-btn message" onClick={() => openDm('profile')}>
                            私信
                          </button>
                        </div>
                      </div>
                      <div className="profile-details">
                        <h2 className="profile-name">{profileUser.name}</h2>
                        <p className="profile-handle">{profileUser.handle}</p>
                        <p className="profile-bio">{profileUser.bio}</p>
                        <div className="profile-stats">
                          <div className="stat-item">
                            <span className="stat-value">{profileFollowerCount}</span>
                            <span className="stat-label"> 关注者</span>
                          </div>
                          <div className="stat-item">
                            <span className="stat-value">{profileUser.stats?.following ?? 0}</span>
                            <span className="stat-label"> 正在关注</span>
                          </div>
                          <div className="stat-item">
                            <span className="stat-value">{profileUser.stats?.likes_received ?? 0}</span>
                            <span className="stat-label"> 获赞</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </header>
                  <main className="profile-post-stream">
                    {userPosts.map((post, index) => (
                      <article key={`profile-${post.id}`} className="post-card">
                        <header className="post-header">
                          <div
                            className="post-avatar"
                            style={{ background: profileUser.avatar_bg ?? 'linear-gradient(135deg,#88f,#f88)' }}
                          >
                            {profileUser.avatar_char ?? getInitialChar(profileUser.name)}
                          </div>
                          <div className="post-user-info">
                            <span className="post-user-name">{profileUser.name}</span>
                            <span className="post-user-handle">{profileUser.handle}</span>
                          </div>
                        </header>
                        <p className="post-body">{post.body}</p>
                        {post.image_caption && (
                          <figure className="post-photo">
                            <figcaption>{post.image_caption}</figcaption>
                          </figure>
                        )}
                        <footer className="post-footer">
                          <button
                            type="button"
                            className="footer-action"
                            onClick={() =>
                              setUserOpenComments((prev) => ({ ...prev, [index]: !prev[index] }))
                            }
                          >
                            <svg viewBox="0 0 24 24">
                              <path d="M14.046 2.242l-4.148-.01h-.002c-4.374 0-7.8 3.427-7.8 7.802 0 4.098 3.186 7.206 7.465 7.37v3.828c0 .108.044.286.12.403.142.225.384.347.632.347.138 0 .277-.038.402-.118.264-.168 6.473-4.14 8.088-5.506 1.902-1.61 3.04-3.97 3.043-6.312v-.017c-.006-4.367-3.43-7.787-7.8-7.788zm3.787 12.972c-1.134.96-4.862 3.405-6.772 4.643V16.67c.615.033 1.22.048 1.81.048 3.456 0 6.262-2.806 6.262-6.262 0-1.556-.56-2.96-1.5-4.064 1.248 1.39 1.953 3.13 1.953 5.013v.002c0 1.96-1.022 3.85-2.755 5.16z"></path>
                            </svg>
                            <span className="comment-count-display">{post.stats.comments ?? 0}</span>
                          </button>
                          <button
                            type="button"
                            className={`footer-action ${post.stats.is_liked_by_viewer ? 'liked' : ''}`}
                            onClick={() => toggleProfileLike(index)}
                          >
                            <svg viewBox="0 0 24 24">
                              <path d="M12 21.638h-.014C9.403 21.59 1.95 14.856 1.95 8.478c0-3.064 2.525-5.754 5.403-5.754 2.29 0 3.83 1.58 4.646 2.73.814-1.148 2.354-2.73 4.645-2.73 2.88 0 5.404 2.69 5.404 5.755 0 6.376-7.454 13.11-10.037 13.157H12z"></path>
                            </svg>
                            <span className="like-count">{post.stats.likes ?? 0}</span>
                          </button>
                        </footer>
                        <div
                          className="comment-section"
                          style={{ display: userOpenComments[index] ? 'block' : 'none' }}
                        >
                          <div className="comments-list">
                            {(post.comments_data ?? []).map((comment, commentIndex) => (
                              <div key={`${comment.user_name}-${commentIndex}`} className="comment-item">
                                <div className="comment-avatar">{comment.avatar ?? getInitialChar(comment.user_name)}</div>
                                <div className="comment-content">
                                  <div className="comment-user-info-container">
                                    <span className="comment-user-name">{comment.user_name}</span>
                                    <button type="button" className="comment-reply-btn">
                                      回复
                                    </button>
                                  </div>
                                  <span className="comment-text">{comment.text}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="comment-input-area">
                            <textarea className="comment-input" placeholder="添加你的评论…" rows={1}></textarea>
                            <button type="button" className="comment-send-btn">
                              发送
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </main>
                </div>
              </div>
            </section>
            <section className={dmViewClasses} data-view="dm">
              <div className="phone-screen">
                <div className="dm-page">
                  <header className="dm-header">
                    <button
                      className="back-btn"
                      type="button"
                      onClick={() => {
                        if (hasActivePartner) {
                          setDmPartnerOverride(null);
                          return;
                        }
                        setActiveView(dmBackTarget);
                      }}
                    >
                      <svg viewBox="0 0 24 24">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path>
                      </svg>
                    </button>
                    {hasActivePartner && (
                      <div
                        className="dm-header-avatar"
                        style={{ background: activeDmPartner.avatar_bg ?? 'linear-gradient(135deg,#88f,#f88)' }}
                      >
                        {activeDmPartner.avatar_icon ??
                          activeDmPartner.avatar_char ??
                          getInitialChar(activeDmPartner.name, '')}
                      </div>
                    )}
                    <div className="user-info">
                      {hasActivePartner ? (
                        <>
                          <span className="user-name">{activeDmPartner.name}</span>
                          <span className="user-handle">{activeDmPartner.handle}</span>
                        </>
                      ) : (
                        <span className="user-name">选择好友</span>
                      )}
                    </div>
                    {hasActivePartner && (
                      <div className="dm-header-actions">
                        <button className="dm-action-btn" type="button" onClick={() => void handleExportNpcChats()}>
                          导出
                        </button>
                        <button
                          className="dm-action-btn"
                          type="button"
                          onClick={() => dmImportInputRef.current?.click()}
                        >
                          导入
                        </button>
                        <button
                          className="dm-action-btn danger"
                          type="button"
                          onClick={() => void handleDeleteNpcChat()}
                        >
                          清空
                        </button>
                        <input
                          ref={dmImportInputRef}
                          type="file"
                          accept="application/json"
                          onChange={handleImportNpcChatsFile}
                          style={{ display: 'none' }}
                        />
                      </div>
                    )}
                  </header>
                  {!hasActivePartner ? (
                    <div className="dm-friend-list">
                      {matchList.length > 0 ? (
                        <section className="match-section">
                          <div className="match-section-title">好友列表</div>
                          <div className="match-list">
                            {matchList.map((match) => (
                              <button
                                key={match.handle}
                                type="button"
                                className="match-item"
                                onClick={() =>
                                  setDmPartnerOverride({
                                    name: match.name,
                                    handle: match.handle,
                                    avatar_icon: match.avatar_icon,
                                    avatar_bg: match.avatar_bg,
                                  })
                                }
                              >
                                <div
                                  className="match-avatar"
                                  style={{ background: match.avatar_bg ?? 'linear-gradient(135deg,#88f,#f88)' }}
                                >
                                  {match.avatar_icon ?? getInitialChar(match.name, '')}
                                </div>
                                <div className="match-info">
                                  <span className="match-name">{match.name}</span>
                                  <span className="match-handle">{match.handle}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </section>
                      ) : (
                        <div className="dm-empty-tip">暂无好友</div>
                      )}
                    </div>
                  ) : (
                    <>
                      <main className="dm-message-stream">
                        {dmMessages.map((message, index) => {
                          const prev = dmMessages[index - 1];
                          const next = dmMessages[index + 1];
                          const isContinuation =
                            prev &&
                            prev.sender_handle === message.sender_handle &&
                            prev.timestamp === message.timestamp;
                          const isLastInGroup =
                            !next ||
                            next.sender_handle !== message.sender_handle ||
                            next.timestamp !== message.timestamp;
                          const isViewerSender = message.sender_handle === dmViewer.handle;
                          const groupClass = isViewerSender ? 'viewer-message' : 'partner-message';
                          const avatarClass = isViewerSender ? 'viewer-avatar-bg' : '';
                          const avatarContent = isViewerSender
                            ? dmViewer.avatar_icon ?? dmViewer.avatar_char ?? getInitialChar(dmViewer.name, '')
                            : activeDmPartner.avatar_icon ??
                              activeDmPartner.avatar_char ??
                              getInitialChar(activeDmPartner.name, '');
                          const avatarStyle =
                            !isViewerSender && activeDmPartner.avatar_bg
                              ? { background: activeDmPartner.avatar_bg }
                              : undefined;

                          return (
                            <div
                              key={`${message.sender_handle}-${index}`}
                              className={`message-group ${groupClass} ${isContinuation ? 'is-continuation' : ''} ${
                                isLastInGroup ? 'has-meta' : ''
                              }`}
                            >
                              <div className={`message-avatar ${avatarClass}`} style={avatarStyle}>
                                {avatarContent}
                              </div>
                              <div className="message-content-wrapper">
                                <div className="message-bubble">{message.content}</div>
                                <div className="message-meta">
                                  {isViewerSender ? (
                                    <span className={`message-status ${message.is_read ? 'status-read' : 'status-sent'}`}>
                                      {message.is_read ? '已读' : '送达'}
                                    </span>
                                  ) : null}
                                  <span className="message-timestamp">{message.timestamp}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </main>
                      <div
                        className="dm-staged-messages"
                        style={{ display: dmStagedMessages.length > 0 ? 'block' : 'none' }}
                      >
                        {dmStagedMessages.map((msg, index) => (
                          <div key={`staged-${index}`} className="staged-message-item">
                            <span>{msg.length > 30 ? `${msg.substring(0, 27)}...` : msg}</span>
                            <button
                              className="remove-staged-btn"
                              type="button"
                              onClick={() =>
                                setDmStagedMessages((prev) => prev.filter((_, msgIndex) => msgIndex !== index))
                              }
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <footer className="message-composer">
                        <div className="composer-input-wrapper">
                          <textarea
                            className="composer-input"
                            placeholder="发送消息…"
                            rows={1}
                            value={dmInput}
                            onChange={(event) => setDmInput(event.target.value)}
                            onKeyDown={handleDmKeyDown}
                          ></textarea>
                          <div className="composer-actions">
                            <button className="send-btn" type="button" onClick={handleStageMessage}>
                              添加
                            </button>
                            <button className="send-btn major" type="button" onClick={handleSendAllMessages}>
                              全部发送
                            </button>
                          </div>
                        </div>
                      </footer>
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default App;

