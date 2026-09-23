import React from 'react';
import { getImplicitLinkParams } from '../utils/implicitParams';
import {
  fetchPublicGroups,
  fetchGroupMembers,
  addGroupMembers,
  removeGroupMembers,
  searchPersons
} from '../utils/api';
import '../styles/group-member-manager.css';

const prefixCls = 'gmm';

/**
 * Collect params: prefer e-builder implicit params (sessionStorage.jumplinkParams),
 * fall back to URL query (?groupIds=... / ?groupId=...).
 */
function collectParams() {
  const implicit = getImplicitLinkParams();
  if (implicit.groupIds !== undefined || implicit.groupId !== undefined) {
    return implicit;
  }
  const urlParams = {};
  new URLSearchParams(window.location.search).forEach((v, k) => {
    urlParams[k] = v;
  });
  return urlParams;
}

/**
 * Parse groupIds from params (supports single groupId, comma/space separated).
 */
function parseGroupIds(params) {
  const raw = params.groupIds || params.groupId || '';
  if (!raw) return [];
  return String(raw)
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Normalize addSource param for the Add Members modal:
 * 'internal' | 'external' | 'both' (default 'both').
 * 'both' shows both Internal/External tabs; a specific value locks the modal
 * to that single source (tabs hidden, source fixed).
 */
function normalizeAddSourceMode(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return v === 'internal' || v === 'external' ? v : 'both';
}

/**
 * Group member management page (public groups only).
 *
 * Entry: e-builder button "Open Page - Implicit Params" carries groupIds
 * (comma-separated group IDs). The page shows only those public groups and
 * lets module admins expand a group to view members and quickly add / remove.
 *
 * Optional param: addSource = internal | external | both (default both).
 * Controls which source tabs the "Add Members" modal shows.
 */
class GroupMemberManager extends React.Component {
  constructor(props) {
    super(props);
    const params = collectParams();
    const groupIds = parseGroupIds(params);
    const addSourceMode = normalizeAddSourceMode(params.addSource);
    this.state = {
      initState: 'loading', // loading | noParam | ready | emptyGroups
      params,
      groupIds,
      addSourceMode,
      groups: [],
      groupSearch: '',
      expandedIds: new Set(),
      membersMap: {},
      memberSearchMap: {},
      membersLoadingMap: {},
      membersErrorMap: {},
      addModal: null, // { groupId, groupName, keyword, searching, results, selected }
      removeConfirm: null, // { group, member }
      removing: false,
      toast: null
    };
    this.toastTimer = null;
    this.searchTimer = null;
  }

  componentDidMount() {
    const { groupIds } = this.state;
    if (!groupIds.length) {
      this.setState({ initState: 'noParam' });
      return;
    }
    this.loadGroups();
  }

  componentWillUnmount() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  // ---------- data loading ----------

  loadGroups = async () => {
    this.setState({ initState: 'loading' });
    try {
      const { groupIds } = this.state;
      const all = await fetchPublicGroups();
      // keep only the public groups passed in params, in the passed order
      const groups = groupIds
        .map((id) => all.find((g) => String(g.id) === String(id)))
        .filter(Boolean);
      if (!groups.length) {
        this.setState({ initState: 'emptyGroups' });
        return;
      }
      this.setState({ initState: 'ready', groups });
    } catch (e) {
      this.setState({
        initState: 'ready',
        groups: []
      });
      this.showToast(`Failed to load groups: ${e.message}`, 'error');
    }
  };

  toggleExpand = (groupId) => {
    const { expandedIds, membersMap } = this.state;
    const next = new Set(expandedIds);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
      // load members on first expand
      if (membersMap[groupId] === undefined) {
        this.loadMembers(groupId);
      }
    }
    this.setState({ expandedIds: next });
  };

  loadMembers = async (groupId) => {
    this.setState((s) => ({
      membersLoadingMap: { ...s.membersLoadingMap, [groupId]: true },
      membersErrorMap: { ...s.membersErrorMap, [groupId]: '' }
    }));
    try {
      const members = await fetchGroupMembers(groupId);
      this.setState((s) => ({
        membersMap: { ...s.membersMap, [groupId]: members },
        membersLoadingMap: { ...s.membersLoadingMap, [groupId]: false }
      }));
    } catch (e) {
      this.setState((s) => ({
        membersLoadingMap: { ...s.membersLoadingMap, [groupId]: false },
        membersErrorMap: { ...s.membersErrorMap, [groupId]: e.message }
      }));
      this.showToast(`Failed to load members: ${e.message}`, 'error');
    }
  };

  refreshMembers = async (groupId) => {
    await this.loadMembers(groupId);
  };

  // ---------- group search (client-side filter) ----------

  handleGroupSearch = (e) => {
    this.setState({ groupSearch: e.target.value });
  };

  get filteredGroups() {
    const { groups, groupSearch } = this.state;
    const kw = groupSearch.trim().toLowerCase();
    if (!kw) return groups;
    return groups.filter(
      (g) =>
        (g.name || '').toLowerCase().includes(kw) ||
        ((g.creator && g.creator.username) || '').toLowerCase().includes(kw)
    );
  }

  // ---------- member panel ----------

  handleMemberSearch = (groupId, e) => {
    this.setState((s) => ({
      memberSearchMap: { ...s.memberSearchMap, [groupId]: e.target.value }
    }));
  };

  getFilteredMembers(groupId) {
    const { membersMap, memberSearchMap } = this.state;
    const members = membersMap[groupId] || [];
    const kw = (memberSearchMap[groupId] || '').trim().toLowerCase();
    if (!kw) return members;
    return members.filter(
      (m) =>
        (m.username || '').toLowerCase().includes(kw) ||
        (m.name || '').toLowerCase().includes(kw) ||
        (m.department || '').toLowerCase().includes(kw) ||
        (m.position || '').toLowerCase().includes(kw)
    );
  }

  // ---------- add members ----------

  openAddModal = (group) => {
    const { addSourceMode } = this.state;
    this.setState({
      addModal: {
        groupId: group.id,
        groupName: group.name,
        // 'both' → start on internal (tabs shown); locked mode → fixed source
        source: addSourceMode === 'both' ? 'internal' : addSourceMode, // internal | external
        keyword: '',
        searching: false,
        results: [],
        selected: new Set(),
        submitting: false
      }
    });
  };

  closeAddModal = () => {
    this.setState({ addModal: null });
  };

  switchAddSource = (source) => {
    const { addModal } = this.state;
    if (!addModal || addModal.source === source) return;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.setState((s) => ({
      addModal: {
        ...s.addModal,
        source,
        keyword: '',
        searching: false,
        results: [],
        selected: new Set()
      }
    }));
  };

  handleAddKeyword = (e) => {
    const value = e.target.value;
    this.setState((s) => ({
      addModal: { ...s.addModal, keyword: value, results: [], selected: new Set() }
    }));
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const kw = value.trim();
    if (!kw) return;
    // debounce 300ms then quick search
    this.searchTimer = setTimeout(() => this.doSearch(kw), 300);
  };

  doSearch = async (keyword) => {
    const { addModal } = this.state;
    if (!addModal) return;
    this.setState((s) => ({
      addModal: { ...s.addModal, searching: true }
    }));
    try {
      const results = await searchPersons(keyword, {
        external: addModal.source === 'external'
      });
      this.setState((s) => ({
        addModal: { ...s.addModal, searching: false, results }
      }));
    } catch (e) {
      this.setState((s) => ({
        addModal: { ...s.addModal, searching: false, results: [] }
      }));
      this.showToast(`Failed to search people: ${e.message}`, 'error');
    }
  };

  toggleSelect = (id) => {
    const { addModal } = this.state;
    const selected = new Set(addModal.selected);
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    this.setState((s) => ({ addModal: { ...s.addModal, selected } }));
  };

  clearSelected = () => {
    this.setState((s) => ({
      addModal: { ...s.addModal, selected: new Set() }
    }));
  };

  confirmAdd = async () => {
    const { addModal } = this.state;
    if (!addModal || addModal.selected.size === 0) return;
    const empIds = Array.from(addModal.selected);
    this.setState((s) => ({ addModal: { ...s.addModal, submitting: true } }));
    try {
      const updated = await addGroupMembers(addModal.groupId, empIds);
      // update group member count
      this.updateGroupAfterChange(addModal.groupId, updated);
      const groupId = addModal.groupId;
      this.setState({ addModal: null });
      this.showToast(
        empIds.length > 1 ? `Added ${empIds.length} members` : 'Added 1 member',
        'success'
      );
      this.loadMembers(groupId);
    } catch (e) {
      this.setState((s) => ({ addModal: { ...s.addModal, submitting: false } }));
      this.showToast(`Failed to add members: ${e.message}`, 'error');
    }
  };

  // ---------- remove member ----------

  askRemove = (group, member) => {
    this.setState({ removeConfirm: { group, member } });
  };

  closeRemoveConfirm = () => {
    this.setState({ removeConfirm: null });
  };

  confirmRemove = async () => {
    const { removeConfirm } = this.state;
    if (!removeConfirm) return;
    const { group, member } = removeConfirm;
    const empId = member.employeeId || member.id;
    this.setState({ removing: true });
    try {
      const updated = await removeGroupMembers(group.id, [empId]);
      this.updateGroupAfterChange(group.id, updated);
      this.setState({ removeConfirm: null, removing: false });
      this.showToast(
        `Removed "${member.username || member.name}" from group`,
        'success'
      );
      this.loadMembers(group.id);
    } catch (e) {
      this.setState({ removing: false, removeConfirm: null });
      this.showToast(`Failed to remove member: ${e.message}`, 'error');
    }
  };

  updateGroupAfterChange(groupId, updated) {
    this.setState((s) => ({
      groups: s.groups.map((g) =>
        String(g.id) === String(groupId)
          ? {
              ...g,
              userCount:
                updated && updated.userCount != null ? updated.userCount : g.userCount,
              memberNames:
                updated && updated.memberNames != null ? updated.memberNames : g.memberNames
            }
          : g
      )
    }));
  }

  // ---------- toast ----------

  showToast = (msg, type = 'success') => {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    const id = Date.now();
    this.setState({ toast: { id, msg, type } });
    this.toastTimer = setTimeout(() => {
      this.setState({ toast: null });
    }, 2600);
  };

  // ---------- render ----------

  renderHeader() {
    const { groupSearch } = this.state;
    return (
      <div className={`${prefixCls}-titlebar`}>
        <div className={`${prefixCls}-titlebar-left`}>
          <h1 className={`${prefixCls}-title`}>Group Member Management</h1>
        </div>
        <div className={`${prefixCls}-titlebar-right`}>
          <div className={`${prefixCls}-search-box`}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="#999">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
            <input
              type="text"
              placeholder="Search group name / creator"
              value={groupSearch}
              onChange={this.handleGroupSearch}
            />
          </div>
          <button className={`${prefixCls}-btn ${prefixCls}-btn-default`} onClick={this.loadGroups}>
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
              <path d="M13.65 2.35A7.95 7.95 0 0 0 8 0C3.58 0 0 3.58 0 8s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 8 14c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 4V0h2v5a1 1 0 0 1-1 1H9V4h2.06A5.94 5.94 0 0 0 8 2c-3.31 0-6 2.69-6 6s2.69 6 6 6a6.01 6.01 0 0 0 5.65-4H16c-.7 2.61-3.09 4.5-8 4.5a8 8 0 0 1 0-16 7.97 7.97 0 0 1 5.65 2.35z" transform="scale(0.9) translate(0.9 0.9)"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  renderLoading() {
    return (
      <div className={`${prefixCls}-center-state`}>
        <div className={`${prefixCls}-spinner`} />
        <p>Loading groups...</p>
      </div>
    );
  }

  renderNoParam() {
    const { params } = this.state;
    return (
      <div className={`${prefixCls}-center-state`}>
        <div className={`${prefixCls}-empty-icon`}>📭</div>
        <h2>No group parameters received</h2>
        <p className={`${prefixCls}-center-desc`}>
          This page is opened from a management entry (e-builder button with
          "Open Page - Implicit Params"). The <code>groupIds</code> parameter
          (comma-separated group IDs) decides which public groups to manage.
        </p>
        <details className={`${prefixCls}-debug`}>
          <summary>View param details (debug)</summary>
          <pre>{JSON.stringify(params, null, 2)}</pre>
          <pre>{sessionStorage.getItem('jumplinkParams') || '(sessionStorage.jumplinkParams is empty)'}</pre>
        </details>
      </div>
    );
  }

  renderEmptyGroups() {
    const { groupIds } = this.state;
    return (
      <div className={`${prefixCls}-center-state`}>
        <div className={`${prefixCls}-empty-icon`}>🔍</div>
        <h2>No matching public groups found</h2>
        <p className={`${prefixCls}-center-desc`}>
          The group IDs passed do not exist in the current tenant or are not accessible:
        </p>
        <pre className={`${prefixCls}-debug-pre`}>{groupIds.join('\n')}</pre>
      </div>
    );
  }

  renderGroupTable() {
    const { expandedIds, groups } = this.state;
    const list = this.filteredGroups;
    return (
      <div className={`${prefixCls}-table-wrap`}>
        {list.length === 0 ? (
          <div className={`${prefixCls}-table-empty`}>No matching groups</div>
        ) : (
          <div className={`${prefixCls}-table`}>
            <div className={`${prefixCls}-row ${prefixCls}-table-head`}>
              <div className={`${prefixCls}-col-expand`} />
              <div className={`${prefixCls}-col-name`}>Group Name</div>
              <div className={`${prefixCls}-col-type`}>Type</div>
              <div className={`${prefixCls}-col-count`}>Members</div>
              <div className={`${prefixCls}-col-creator`}>Creator</div>
              <div className={`${prefixCls}-col-time`}>Created Time</div>
              <div className={`${prefixCls}-col-ops`}>Operations</div>
            </div>
            {list.map((g) => {
              const isOpen = expandedIds.has(g.id);
              return (
                <div className={`${prefixCls}-group-item`} key={g.id}>
                  <div
                    className={`${prefixCls}-row ${prefixCls}-table-row ${isOpen ? 'is-open' : ''}`}
                    onClick={() => this.toggleExpand(g.id)}
                  >
                    <div className={`${prefixCls}-col-expand`}>
                      <span className={`${prefixCls}-chevron ${isOpen ? 'open' : ''}`}>
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                          <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
                        </svg>
                      </span>
                    </div>
                    <div className={`${prefixCls}-col-name`}>
                      <span className={`${prefixCls}-group-name`}>{g.name}</span>
                    </div>
                    <div className={`${prefixCls}-col-type`}>Public Group</div>
                    <div className={`${prefixCls}-col-count`}>
                      <span className={`${prefixCls}-member-count`}>{g.userCount}</span>
                    </div>
                    <div className={`${prefixCls}-col-creator`}>
                      {(g.creator && g.creator.username) || '-'}
                    </div>
                    <div className={`${prefixCls}-col-time`}>{g.createTime || '-'}</div>
                    <div className={`${prefixCls}-col-ops`} onClick={(e) => e.stopPropagation()}>
                      <span
                        className={`${prefixCls}-expand-link ${isOpen ? 'is-open' : ''}`}
                        onClick={() => this.toggleExpand(g.id)}
                      >
                        {isOpen ? 'Hide Members' : 'Members'}
                      </span>
                    </div>
                  </div>
                  <div className={`${prefixCls}-group-detail ${isOpen ? 'open' : ''}`}>
                    <div className={`${prefixCls}-group-detail-inner`}>
                      {this.renderMemberPanel(g)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  renderMemberPanel(group) {
    const { membersMap, membersLoadingMap, membersErrorMap, memberSearchMap } = this.state;
    const loading = membersLoadingMap[group.id];
    const error = membersErrorMap[group.id];
    const members = membersMap[group.id] || [];
    const filtered = this.getFilteredMembers(group.id);
    const kw = memberSearchMap[group.id] || '';

    return (
      <div className={`${prefixCls}-member-panel`}>
        <div className={`${prefixCls}-member-toolbar`}>
          <div className={`${prefixCls}-member-left`}>
            <div className={`${prefixCls}-member-title`}>
              Members
              <span className={`${prefixCls}-count-badge`}>{members.length}</span>
              {filtered.length !== members.length && (
                <span className={`${prefixCls}-count-badge muted`}>
                  {filtered.length} matched
                </span>
              )}
            </div>
            <button
              className={`${prefixCls}-btn ${prefixCls}-btn-primary`}
              onClick={() => this.openAddModal(group)}
            >
              ＋ Add Member
            </button>
          </div>
          <div className={`${prefixCls}-member-tools`}>
            <div className={`${prefixCls}-search-box member`}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="#999">
                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
              </svg>
              <input
                type="text"
                placeholder="Filter members in this group"
                value={kw}
                onChange={(e) => this.handleMemberSearch(group.id, e)}
              />
            </div>
            <button
              className={`${prefixCls}-btn ${prefixCls}-btn-default`}
              onClick={() => this.refreshMembers(group.id)}
              title="Refresh members"
            >
              ↻
            </button>
          </div>
        </div>

        {loading ? (
          <div className={`${prefixCls}-member-loading`}>
            <div className={`${prefixCls}-spinner sm`} />
            <span>Loading members...</span>
          </div>
        ) : error ? (
          <div className={`${prefixCls}-member-error`}>Failed to load members: {error}</div>
        ) : filtered.length === 0 ? (
          <div className={`${prefixCls}-table-empty`}>
            {members.length === 0
              ? 'No members in this group yet. Click "Add Member" to add.'
              : 'No matching members'}
          </div>
        ) : (
          <div className={`${prefixCls}-member-table`}>
            <div className={`${prefixCls}-member-row ${prefixCls}-member-head`}>
              <div className={`${prefixCls}-mcol-user`}>Full Name</div>
              <div className={`${prefixCls}-mcol-sub`}>Root Organization</div>
              <div className={`${prefixCls}-mcol-dept`}>Section</div>
              <div className={`${prefixCls}-mcol-pos`}>Job Title</div>
              <div className={`${prefixCls}-mcol-ops`}>Operations</div>
            </div>
            {filtered.map((m, idx) => (
              <div
                className={`${prefixCls}-member-row ${prefixCls}-member-body-row`}
                key={m.id || m.employeeId || idx}
                style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
              >
                <div className={`${prefixCls}-mcol-user`}>
                  <span className={`${prefixCls}-user-avatar`}>{this.memberAvatarChar(m)}</span>
                  <span className={`${prefixCls}-user-name`}>{m.username || m.name}</span>
                </div>
                <div className={`${prefixCls}-mcol-sub`}>{m.subcompany || '-'}</div>
                <div className={`${prefixCls}-mcol-dept`}>{m.department || '-'}</div>
                <div className={`${prefixCls}-mcol-pos`}>{m.position || '-'}</div>
                <div className={`${prefixCls}-mcol-ops`}>
                  <button
                    className={`${prefixCls}-btn ${prefixCls}-btn-danger-sm`}
                    onClick={() => this.askRemove(group, m)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  memberAvatarChar(m) {
    const name = m.username || m.name || '?';
    return name.trim().charAt(0).toUpperCase();
  }

  renderAddModal() {
    const { addModal, addSourceMode } = this.state;
    if (!addModal) return null;
    const { groupName, keyword, searching, results, selected, submitting, source } = addModal;
    const isExternal = source === 'external';
    const showTabs = addSourceMode === 'both';
    return (
      <div
        className={`${prefixCls}-modal-mask`}
        onClick={submitting ? undefined : this.closeAddModal}
      >
        <div
          className={`${prefixCls}-modal ${prefixCls}-add-modal`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`${prefixCls}-modal-header`}>
            <span className={`${prefixCls}-modal-title`}>Add Members</span>
            <span className={`${prefixCls}-modal-sub`}>
              Group: {groupName}
              {!showTabs && (
                <span className={`${prefixCls}-source-badge`}>
                  {isExternal ? 'External' : 'Internal'}
                </span>
              )}
            </span>
            <button
              className={`${prefixCls}-modal-close`}
              onClick={this.closeAddModal}
              disabled={submitting}
            >
              ✕
            </button>
          </div>

          {showTabs && (
            <div className={`${prefixCls}-add-tabs`}>
              <button
                type="button"
                className={`${prefixCls}-add-tab ${!isExternal ? 'active' : ''}`}
                onClick={() => this.switchAddSource('internal')}
              >
                Internal
              </button>
              <button
                type="button"
                className={`${prefixCls}-add-tab ${isExternal ? 'active' : ''}`}
                onClick={() => this.switchAddSource('external')}
              >
                External
              </button>
            </div>
          )}

          <div className={`${prefixCls}-add-search`}>
            <div className={`${prefixCls}-search-box large`}>
              <svg viewBox="0 0 16 16" width="15" height="15" fill="#999">
                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
              </svg>
              <input
                type="text"
                placeholder={
                  isExternal
                    ? 'Name / email / mobile, Enter or Search'
                    : 'Name / pinyin / account / email / mobile, Enter or Search'
                }
                value={keyword}
                autoFocus
                onChange={this.handleAddKeyword}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && keyword.trim()) this.doSearch(keyword.trim());
                }}
              />
            </div>
            <button
              className={`${prefixCls}-btn ${prefixCls}-btn-primary`}
              onClick={() => keyword.trim() && this.doSearch(keyword.trim())}
            >
              Search
            </button>
          </div>

          <div className={`${prefixCls}-add-result`}>
            {searching ? (
              <div className={`${prefixCls}-member-loading`}>
                <div className={`${prefixCls}-spinner sm`} />
                <span>Searching people...</span>
              </div>
            ) : results.length === 0 ? (
              <div className={`${prefixCls}-table-empty`}>
                {keyword.trim()
                  ? 'No matching people found'
                  : 'Enter a name to quick search, select results, then click Add.'}
              </div>
            ) : (
              results.map((r, idx) => {
                const checked = selected.has(r.id);
                const meta = isExternal
                  ? ([r.subcompany, r.department].filter(Boolean).join(' · ') ||
                      r.position ||
                      r.contact_way ||
                      r.mobile ||
                      r.email ||
                      'External Contact')
                  : `${r.department || '-'} · ${r.position || '-'}`;
                return (
                  <div
                    className={`${prefixCls}-person-item ${checked ? 'checked' : ''}`}
                    key={r.id}
                    onClick={() => this.toggleSelect(r.id)}
                    style={{ animationDelay: `${Math.min(idx * 25, 250)}ms` }}
                  >
                    <label className={`${prefixCls}-checkbox`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => this.toggleSelect(r.id)}
                      />
                      <span className={`${prefixCls}-checkbox-mark`} />
                    </label>
                    <span className={`${prefixCls}-person-avatar`}>
                      {(r.name || '?').trim().charAt(0).toUpperCase()}
                    </span>
                    <div className={`${prefixCls}-person-info`}>
                      <div className={`${prefixCls}-person-name`}>{r.name}</div>
                      <div className={`${prefixCls}-person-meta`}>{meta}</div>
                    </div>
                    <span className={`${prefixCls}-person-check`}>{checked ? '✓' : ''}</span>
                  </div>
                );
              })
            )}
          </div>

          <div className={`${prefixCls}-modal-footer`}>
            <span className={`${prefixCls}-selected-info`}>Selected {selected.size}</span>
            <button
              className={`${prefixCls}-btn ${prefixCls}-btn-default`}
              onClick={this.clearSelected}
              disabled={selected.size === 0 || submitting}
            >
              Clear Selection
            </button>
            <button
              className={`${prefixCls}-btn ${prefixCls}-btn-primary`}
              onClick={this.confirmAdd}
              disabled={selected.size === 0 || submitting}
            >
              {submitting ? 'Adding...' : `Add (${selected.size})`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  renderRemoveConfirm() {
    const { removeConfirm, removing } = this.state;
    if (!removeConfirm) return null;
    const { group, member } = removeConfirm;
    return (
      <div
        className={`${prefixCls}-modal-mask`}
        onClick={removing ? undefined : this.closeRemoveConfirm}
      >
        <div
          className={`${prefixCls}-modal ${prefixCls}-confirm-modal`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`${prefixCls}-modal-header`}>
            <span className={`${prefixCls}-modal-title`}>Remove Member</span>
            <button
              className={`${prefixCls}-modal-close`}
              onClick={this.closeRemoveConfirm}
              disabled={removing}
            >
              ✕
            </button>
          </div>
          <div className={`${prefixCls}-confirm-body`}>
            <div className={`${prefixCls}-confirm-icon`}>❗</div>
            <p>
              Are you sure you want to remove{' '}
              <b>{member.username || member.name}</b> from group{' '}
              <b>"{group.name}"</b>?
            </p>
            <p className={`${prefixCls}-confirm-tip`}>
              The member will no longer belong to this group.
            </p>
          </div>
          <div className={`${prefixCls}-modal-footer`}>
            <button
              className={`${prefixCls}-btn ${prefixCls}-btn-default`}
              onClick={this.closeRemoveConfirm}
              disabled={removing}
            >
              Cancel
            </button>
            <button
              className={`${prefixCls}-btn ${prefixCls}-btn-danger`}
              onClick={this.confirmRemove}
              disabled={removing}
            >
              {removing ? 'Removing...' : 'Remove'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  renderToast() {
    const { toast } = this.state;
    if (!toast) return null;
    return (
      <div key={toast.id} className={`${prefixCls}-toast ${toast.type}`}>
        {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
      </div>
    );
  }

  render() {
    const { initState } = this.state;
    return (
      <div className={`${prefixCls}-page`}>
        {this.renderHeader()}
        <div className={`${prefixCls}-body`}>
          {initState === 'loading' && this.renderLoading()}
          {initState === 'noParam' && this.renderNoParam()}
          {initState === 'emptyGroups' && this.renderEmptyGroups()}
          {initState === 'ready' && this.renderGroupTable()}
        </div>
        {this.renderAddModal()}
        {this.renderRemoveConfirm()}
        {this.renderToast()}
      </div>
    );
  }
}

export default GroupMemberManager;
