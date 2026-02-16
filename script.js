(function() {
    // ================== 配置区 ==================
    const SUPABASE_URL = 'https://ktglukdrslxqirefbqvg.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0Z2x1a2Ryc2x4cWlyZWZicXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMTY0MTEsImV4cCI6MjA4NjU5MjQxMX0.PVMisfYM4BdlMcY-zV20PqP-sPoBwZg2BHGPHMjocFk';
    // ============================================

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 全局状态
    let state = {
        items: [],
        borrowRecords: [],
        requests: [],
        members: []
    };

    let currentUser = null;
    let currentRole = null;

    // 存储搜索词，用于保留输入
    let memberSearchTerm = '';
    let adminSearchTerm = '';

    // 辅助函数：格式化日期
    function formatDate(timestamp) {
        if (!timestamp) return '未知日期';
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function generateId(prefix = '') {
        return prefix + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    }

    // 从云端拉取所有数据
    async function fetchAllData() {
        try {
            const [itemsRes, borrowsRes, requestsRes, membersRes] = await Promise.all([
                supabase.from('items').select('*'),
                supabase.from('borrow_records').select('*'),
                supabase.from('requests').select('*'),
                supabase.from('members').select('*')
            ]);

            if (itemsRes.error) throw itemsRes.error;
            if (borrowsRes.error) throw borrowsRes.error;
            if (requestsRes.error) throw requestsRes.error;
            if (membersRes.error) throw membersRes.error;

            state.items = itemsRes.data || [];
            state.borrowRecords = borrowsRes.data || [];
            state.requests = requestsRes.data || [];
            state.members = membersRes.data || [];
        } catch (err) {
            console.error('数据拉取失败:', err);
            alert('无法连接数据库，请检查网络或 Supabase 配置。');
        }
    }

    // 渲染入口
    async function renderApp() {
        await fetchAllData();
        const appDiv = document.getElementById('app');
        if (!currentUser || !currentRole) {
            appDiv.innerHTML = renderLoginUI();
            attachLoginEvents();
            return;
        }
        if (currentRole === 'admin') {
            appDiv.innerHTML = renderAdminPanel();
        } else {
            appDiv.innerHTML = renderMemberPanel();
        }
        attachMainEvents();
    }

    // 登录界面
    function renderLoginUI() {
        return `
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="font-size: 2.2rem;">📦 公会宝可梦借还</h1>
                <p style="color: #3b6c7c;">需先向Dshadd申请加入名单后登录</p>
            </div>
            <div class="login-section">
                <div class="login-card">
                    <h3>🧑‍💼公会成员登录</h3>
                    <input type="text" id="memberIdInput" placeholder="你的英文ID" autocomplete="off">
                    <button id="memberLoginBtn"> 进入</button>
                </div>
                <div class="login-card">
                    <h3>🛡️ 管理员登录</h3>
                    <input type="text" id="adminNameInput" placeholder="用户名" value="admin" readonly style="background:#e9f0f5;">
                    <input type="password" id="adminPwdInput" placeholder="密码">
                    <button id="adminLoginBtn" class="success-btn">进入</button>
                    <p style="font-size: 0.8rem; color: #567e8a; margin-top: 12px;">需先向Dshadd申请加入名单后登录</p>
                </div>
            </div>
            <div class="footer-note">by Dshadd</div>
        `;
    }

    // 会员主面板（添加撤回功能）
    function renderMemberPanel() {
        const items = state.items;
        const borrows = state.borrowRecords.filter(b => !b.returned);
        const requests = state.requests.filter(r => r.status === 'pending');

        function getItemStatus(itemId) {
            const activeBorrow = borrows.find(b => b.item_id === itemId);
            if (activeBorrow) {
                return `📆 借出日期: ${formatDate(activeBorrow.borrow_date)}`;
            }
            return '✅ 未借';
        }

        let tableRows = '';
        items.forEach(item => {
            const statusText = getItemStatus(item.id);
            const isBorrowed = borrows.some(b => b.item_id === item.id);
            const activeBorrow = borrows.find(b => b.item_id === item.id);
            const borrowedByMe = activeBorrow && activeBorrow.borrower_id === currentUser;
            const hasPendingBorrowRequest = requests.some(r => r.item_id === item.id && r.type === 'borrow');
            
            // 查找当前用户对该物品的待处理请求
            const myPendingBorrowReq = requests.find(r => r.item_id === item.id && r.requester === currentUser && r.type === 'borrow');
            const myPendingReturnReq = requests.find(r => r.item_id === item.id && r.requester === currentUser && r.type === 'return');
            
            const myPendingBorrow = !!myPendingBorrowReq;
            const myPendingReturn = !!myPendingReturnReq;

            let actionBtn = '';
            if (!isBorrowed && !hasPendingBorrowRequest) {
                // 未借且无人申请 → 可借用请求
                actionBtn = `<button class="btn-outline borrow-request-btn" data-itemid="${item.id}" style="width: auto;">📨 借用请求</button>`;
            } else if (!isBorrowed && hasPendingBorrowRequest) {
                if (myPendingBorrow) {
                    // 自己已提交借用请求 → 显示“请求已提交”+撤回按钮
                    actionBtn = `
                        <span style="color: #8a9fa5;">⏳ 请求已提交</span>
                        <button class="withdraw-btn withdraw-request-btn" data-requestid="${myPendingBorrowReq.id}">✖ 撤回</button>
                    `;
                } else {
                    // 他人已申请 → 只显示锁定
                    actionBtn = `<span style="color: #b2876f;">🔒 他人已申请</span>`;
                }
            } else if (isBorrowed && borrowedByMe) {
                if (myPendingReturn) {
                    // 自己已提交归还请求 → 显示“归还请求中”+撤回按钮
                    actionBtn = `
                        <span style="color: #8a9fa5;">⏳ 归还请求中</span>
                        <button class="withdraw-btn withdraw-request-btn" data-requestid="${myPendingReturnReq.id}">✖ 撤回</button>
                    `;
                } else {
                    // 未提交归还请求 → 可提交归还
                    actionBtn = `<button class="btn-outline return-request-btn" data-itemid="${item.id}" style="width: auto; background: #f8e3cd;">↩️ 归还请求</button>`;
                }
            } else if (isBorrowed && !borrowedByMe) {
                const borrower = activeBorrow ? activeBorrow.borrower_id : '未知';
                actionBtn = `<span style="color: #a06b53;">👤 ${borrower} 借出</span>`;
            }

            tableRows += `
                <tr>
                    <td><strong>${item.name}</strong></td>
                    <td class="item-info">${item.info || '—'}</td>
                    <td><span class="status-badge ${isBorrowed ? 'status-borrowed' : ''}">${statusText}</span></td>
                    <td class="action-group">${actionBtn}</td>
                </tr>
            `;
        });

        return `
            <div class="top-bar">
                <div class="badge">🧑 ${currentUser} (成员)</div>
                <button id="logoutBtn" class="logout-btn">🚪 登出</button>
            </div>
            <div class="main-panel">
                <h2>📋 可借物品清单</h2>
                <!-- 搜索框 -->
                <input type="text" id="member-search" class="search-box" placeholder="🔍 搜索物品名称或信息..." value="${memberSearchTerm.replace(/"/g, '&quot;')}">
                <!-- 固定高度滚动容器 -->
                <div class="table-container">
                    <table id="member-items-table">
                        <thead><tr><th>物品名称</th><th>详细信息</th><th>状态</th><th>操作</th></tr></thead>
                        <tbody>${tableRows || '<tr><td colspan="4" class="empty-msg">暂无物品</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
            <div class="footer-note">✅ 数据云端存储，实时同步</div>
        `;
    }

    // 管理员面板（添加搜索框和滚动容器）
    function renderAdminPanel() {
        const items = state.items;
        const borrows = state.borrowRecords.filter(b => !b.returned);
        const pendingRequests = state.requests.filter(r => r.status === 'pending');
        const members = state.members;

        // 物品表格
        let itemRows = '';
        items.forEach(item => {
            const activeBorrow = borrows.find(b => b.item_id === item.id);
            const statusText = activeBorrow 
                ? `📆 借出日期: ${formatDate(activeBorrow.borrow_date)} (${activeBorrow.borrower_id})` 
                : '✅ 未借';
            itemRows += `
                <tr>
                    <td>${item.name}</td>
                    <td>${item.info || '—'}</td>
                    <td><span class="status-badge ${activeBorrow ? 'status-borrowed' : ''}">${statusText}</span></td>
                    <td class="action-group">
                        <button class="btn-outline edit-item-btn" data-itemid="${item.id}" style="width: auto;">✏️ 编辑</button>
                        <button class="danger-btn delete-item-btn" data-itemid="${item.id}" style="width: auto;">🗑️ 删除</button>
                    </td>
                </tr>
            `;
        });

        // 待审批请求
        let requestItems = '';
        if (pendingRequests.length === 0) {
            requestItems = `<div class="empty-msg">✨ 暂无待处理请求</div>`;
        } else {
            pendingRequests.forEach(req => {
                const item = state.items.find(it => it.id === req.item_id);
                const itemName = item ? item.name : '物品已删除';
                const reqTypeText = req.type === 'borrow' ? '📤 借用请求' : '📥 归还请求';
                let approveBtn = req.type === 'borrow'
                    ? `<button class="success-btn approve-borrow-btn" data-requestid="${req.id}" style="width: auto;">✅ 确认借出</button>`
                    : `<button class="success-btn approve-return-btn" data-requestid="${req.id}" style="width: auto;">🔄 确认归还</button>`;
                requestItems += `
                    <div class="request-item">
                        <div><strong>${itemName}</strong><br><span style="color: #3a6c7a;">申请人: ${req.requester}  ·  ${reqTypeText}</span></div>
                        <div class="action-group">
                            ${approveBtn}
                            <button class="danger-btn reject-request-btn" data-requestid="${req.id}" style="width: auto; background: #9f7e6b;">❌ 拒绝</button>
                        </div>
                    </div>
                `;
            });
        }

        // 会员管理列表
        let memberItems = '';
        members.forEach(m => {
            memberItems += `
                <div class="member-item">
                    <span>${m.member_id}</span>
                    <button class="danger-btn delete-member-btn" data-memberid="${m.member_id}" style="width: auto; padding: 6px 12px;">🗑️ 删除</button>
                </div>
            `;
        });

        return `
            <div class="top-bar">
                <div class="badge">🛡️ 管理员：${currentUser}</div>
                <button id="logoutBtn" class="logout-btn">🚪 登出</button>
            </div>
            <div class="main-panel">
                <h2>🛠️ 管理精灵库</h2>
                <!-- 增加物品模块 -->
                <div class="admin-add">
                    <input type="text" id="newItemName" placeholder="物品名称">
                    <input type="text" id="newItemInfo" placeholder="物品信息/描述">
                    <button id="addItemBtn" class="success-btn" style="width: auto; padding: 12px 28px;">➕ 增加物品</button>
                </div>
                <!-- 搜索框 -->
                <input type="text" id="admin-search" class="search-box" placeholder="🔍 搜索物品名称或信息..." value="${adminSearchTerm.replace(/"/g, '&quot;')}">
                <!-- 固定高度滚动容器 -->
                <div class="table-container">
                    <table id="admin-items-table">
                        <thead><tr><th>名称</th><th>信息</th><th>状态(借用人)</th><th>操作</th></tr></thead>
                        <tbody>${itemRows || '<tr><td colspan="4" class="empty-msg">暂无物品，请添加</td></tr>'}</tbody>
                    </table>
                </div>

                <!-- 成员管理模块 -->
                <div style="margin-top: 30px;">
                    <h2>🧑‍🤝‍🧑 管理成员</h2>
                    <div class="member-manage">
                        <input type="text" id="newMemberId" placeholder="新成员ID (英文)">
                        <button id="addMemberBtn" class="success-btn" style="width: auto; padding: 12px 28px;">➕ 增加成员</button>
                    </div>
                    <div class="member-list">
                        <h3>现有会员</h3>
                        ${memberItems || '<div class="empty-msg">暂无会员，请添加</div>'}
                    </div>
                </div>

                <div class="request-list">
                    <h3>⏳ 待审批请求</h3>
                    ${requestItems}
                </div>
            </div>
            <div class="footer-note">.</div>
        `;
    }

    // 通用表格过滤函数
    function filterTable(tableId, searchTerm) {
        const table = document.getElementById(tableId);
        if (!table) return;
        const rows = table.querySelectorAll('tbody tr');
        const term = searchTerm.toLowerCase().trim();
        rows.forEach(row => {
            if (term === '') {
                row.style.display = '';
            } else {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const name = cells[0].innerText.toLowerCase();
                    const info = cells[1].innerText.toLowerCase();
                    if (name.includes(term) || info.includes(term)) {
                        row.style.display = '';
                    } else {
                        row.style.display = 'none';
                    }
                }
            }
        });
    }

    // ---------- 登录事件（大小写不敏感）----------
    function attachLoginEvents() {
        document.getElementById('memberLoginBtn')?.addEventListener('click', async () => {
            const idInput = document.getElementById('memberIdInput');
            const rawId = idInput.value.trim();
            if (!rawId) { alert('请输入英文ID'); return; }
            if (!/^[a-zA-Z][a-zA-Z0-9_]{1,20}$/.test(rawId)) {
                alert('ID需以字母开头，仅包含英文/数字/下划线(2-20位)');
                return;
            }
            const idLower = rawId.toLowerCase();
            
            const { data, error } = await supabase
                .from('members')
                .select('member_id')
                .ilike('member_id', idLower)
                .maybeSingle();
            if (error) {
                alert('验证失败：' + error.message);
                return;
            }
            if (!data) {
                alert('该ID未授权，请联系管理员添加');
                return;
            }
            currentUser = idLower;
            currentRole = 'member';
            memberSearchTerm = '';
            await renderApp();
        });

        document.getElementById('adminLoginBtn')?.addEventListener('click', async () => {
            const pwdInput = document.getElementById('adminPwdInput');
            const password = pwdInput.value;
            const { data, error } = await supabase.from('admin').select('password').eq('id', 1).maybeSingle();
            if (error) {
                alert('管理员验证失败：' + error.message);
                return;
            }
            if (!data || data.password !== password) {
                alert('密码错误');
                return;
            }
            currentUser = 'admin';
            currentRole = 'admin';
            adminSearchTerm = '';
            await renderApp();
        });
    }

    // ---------- 主界面事件绑定（增加撤回事件）----------
    function attachMainEvents() {
        // 登出
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            currentUser = null;
            currentRole = null;
            renderApp();
        });

        // ----- 会员操作 -----
        document.querySelectorAll('.borrow-request-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = e.currentTarget.dataset.itemid;
                await createBorrowRequest(itemId);
            });
        });
        document.querySelectorAll('.return-request-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = e.currentTarget.dataset.itemid;
                await createReturnRequest(itemId);
            });
        });

        // ----- 撤回请求按钮 -----
        document.querySelectorAll('.withdraw-request-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const requestId = e.currentTarget.dataset.requestid;
                if (confirm('确定撤回该请求吗？')) {
                    await withdrawRequest(requestId);
                }
            });
        });

        // ----- 管理员操作（物品管理）-----
        const addBtn = document.getElementById('addItemBtn');
        if (addBtn) {
            addBtn.addEventListener('click', async () => {
                const nameInp = document.getElementById('newItemName');
                const infoInp = document.getElementById('newItemInfo');
                const name = nameInp.value.trim();
                if (!name) { alert('请输入物品名称'); return; }
                const info = infoInp.value.trim() || '无描述';
                await addItem(name, info);
                nameInp.value = '';
                infoInp.value = '';
            });
        }

        document.querySelectorAll('.edit-item-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = e.currentTarget.dataset.itemid;
                const item = state.items.find(i => i.id === itemId);
                if (!item) return;
                const newName = prompt('修改物品名称', item.name);
                if (newName && newName.trim() !== '') {
                    const newInfo = prompt('修改物品信息', item.info);
                    await updateItem(itemId, newName.trim(), newInfo ? newInfo.trim() : '');
                }
            });
        });

        document.querySelectorAll('.delete-item-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = e.currentTarget.dataset.itemid;
                if (confirm('确定删除该物品吗？')) {
                    await deleteItem(itemId);
                }
            });
        });

        // ----- 管理员操作：会员管理（大小写不敏感）-----
        const addMemberBtn = document.getElementById('addMemberBtn');
        if (addMemberBtn) {
            addMemberBtn.addEventListener('click', async () => {
                const newMemberInput = document.getElementById('newMemberId');
                const rawMemberId = newMemberInput.value.trim();
                if (!rawMemberId) { alert('请输入成员ID'); return; }
                if (!/^[a-zA-Z][a-zA-Z0-9_]{1,20}$/.test(rawMemberId)) {
                    alert('ID需以字母开头，仅包含英文/数字/下划线(2-20位)');
                    return;
                }
                const memberId = rawMemberId.toLowerCase();
                
                const existing = state.members.find(m => m.member_id.toLowerCase() === memberId);
                if (existing) {
                    alert('该成员ID已存在');
                    return;
                }
                const { error } = await supabase.from('members').insert([{ member_id: memberId }]);
                if (error) {
                    alert('添加失败：' + error.message);
                    return;
                }
                newMemberInput.value = '';
                await renderApp();
            });
        }

        document.querySelectorAll('.delete-member-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const memberId = e.currentTarget.dataset.memberid;
                if (!confirm(`确定删除成员 ${memberId} 吗？`)) return;
                const { error } = await supabase.from('members').delete().eq('member_id', memberId);
                if (error) {
                    alert('删除失败：' + error.message);
                    return;
                }
                await renderApp();
            });
        });

        // ----- 审批操作 -----
        document.querySelectorAll('.approve-borrow-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const reqId = e.currentTarget.dataset.requestid;
                await approveBorrowRequest(reqId);
            });
        });
        document.querySelectorAll('.approve-return-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const reqId = e.currentTarget.dataset.requestid;
                await approveReturnRequest(reqId);
            });
        });
        document.querySelectorAll('.reject-request-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const reqId = e.currentTarget.dataset.requestid;
                await rejectRequest(reqId);
            });
        });

        // ----- 搜索框事件绑定 -----
        // 会员搜索
        const memberSearch = document.getElementById('member-search');
        if (memberSearch) {
            memberSearch.value = memberSearchTerm; // 确保显示最新词
            memberSearch.addEventListener('input', (e) => {
                memberSearchTerm = e.target.value;
                filterTable('member-items-table', memberSearchTerm);
            });
            // 初始过滤
            filterTable('member-items-table', memberSearchTerm);
        }

        // 管理员搜索
        const adminSearch = document.getElementById('admin-search');
        if (adminSearch) {
            adminSearch.value = adminSearchTerm;
            adminSearch.addEventListener('input', (e) => {
                adminSearchTerm = e.target.value;
                filterTable('admin-items-table', adminSearchTerm);
            });
            filterTable('admin-items-table', adminSearchTerm);
        }
    }

    // ---------- 云端操作函数 ----------
    async function addItem(name, info) {
        const newItem = { id: generateId('itm-'), name, info };
        const { error } = await supabase.from('items').insert([newItem]);
        if (error) { alert('添加失败：' + error.message); return; }
        await renderApp();
    }

    async function updateItem(itemId, name, info) {
        const { error } = await supabase.from('items').update({ name, info }).eq('id', itemId);
        if (error) { alert('更新失败：' + error.message); return; }
        await renderApp();
    }

    async function deleteItem(itemId) {
        const activeBorrow = state.borrowRecords.find(b => b.item_id === itemId && !b.returned);
        if (activeBorrow) { alert('该物品尚未归还，无法删除'); return; }
        const pendingReq = state.requests.find(r => r.item_id === itemId && r.status === 'pending');
        if (pendingReq) { alert('该物品有待审批的请求，请先处理'); return; }

        // 先删除所有相关的借阅记录（包括已归还的）
        const { error: borrowDeleteError } = await supabase
            .from('borrow_records')
            .delete()
            .eq('item_id', itemId);
        if (borrowDeleteError) { alert('删除借阅记录失败：' + borrowDeleteError.message); return; }

        // 再删除所有相关的请求记录
        const { error: requestDeleteError } = await supabase
            .from('requests')
            .delete()
            .eq('item_id', itemId);
        if (requestDeleteError) { alert('删除请求失败：' + requestDeleteError.message); return; }

        // 最后删除物品
        const { error } = await supabase.from('items').delete().eq('id', itemId);
        if (error) { alert('删除失败：' + error.message); return; }
        await renderApp();
    }

    async function createBorrowRequest(itemId) {
        const item = state.items.find(i => i.id === itemId);
        if (!item) return;
        const activeBorrow = state.borrowRecords.find(b => b.item_id === itemId && !b.returned);
        if (activeBorrow) { alert('该物品已借出'); return; }
        const pendingBorrow = state.requests.find(r => r.item_id === itemId && r.type === 'borrow' && r.status === 'pending');
        if (pendingBorrow) { alert('此物品已有待处理的借用请求'); return; }
        const myExist = state.requests.find(r => r.item_id === itemId && r.requester === currentUser && r.type === 'borrow' && r.status === 'pending');
        if (myExist) { alert('你已经提交过借用请求'); return; }

        const newReq = {
            id: generateId('req-'),
            item_id: itemId,
            requester: currentUser,
            type: 'borrow',
            status: 'pending',
            request_date: Date.now()
        };
        const { error } = await supabase.from('requests').insert([newReq]);
        if (error) { alert('提交失败：' + error.message); return; }
        await renderApp();
    }

    async function createReturnRequest(itemId) {
        const activeBorrow = state.borrowRecords.find(b => b.item_id === itemId && !b.returned && b.borrower_id === currentUser);
        if (!activeBorrow) { alert('你没有借用此物品或已归还'); return; }
        const pendingReturn = state.requests.find(r => r.item_id === itemId && r.requester === currentUser && r.type === 'return' && r.status === 'pending');
        if (pendingReturn) { alert('归还请求已提交，请勿重复'); return; }

        const newReq = {
            id: generateId('req-'),
            item_id: itemId,
            requester: currentUser,
            type: 'return',
            status: 'pending',
            request_date: Date.now()
        };
        const { error } = await supabase.from('requests').insert([newReq]);
        if (error) { alert('提交失败：' + error.message); return; }
        await renderApp();
    }

    // 新增：撤回请求函数
    async function withdrawRequest(requestId) {
        const { error } = await supabase.from('requests').delete().eq('id', requestId);
        if (error) {
            alert('撤回失败：' + error.message);
            return;
        }
        await renderApp();
    }

    async function approveBorrowRequest(requestId) {
        const request = state.requests.find(r => r.id === requestId);
        if (!request || request.type !== 'borrow') return;
        const itemId = request.item_id;
        const activeBorrow = state.borrowRecords.find(b => b.item_id === itemId && !b.returned);
        if (activeBorrow) {
            alert('该物品已被借出，无法确认');
            await supabase.from('requests').delete().eq('id', requestId);
            await renderApp();
            return;
        }

        const borrowRecord = {
            id: generateId('br-'),
            item_id: itemId,
            borrower_id: request.requester,
            borrow_date: Date.now(),
            returned: false
        };
        const { error: insertError } = await supabase.from('borrow_records').insert([borrowRecord]);
        if (insertError) { alert('确认失败：' + insertError.message); return; }
        await supabase.from('requests').delete().eq('id', requestId);
        await renderApp();
    }

    async function approveReturnRequest(requestId) {
        const request = state.requests.find(r => r.id === requestId);
        if (!request || request.type !== 'return') return;
        const borrowRecord = state.borrowRecords.find(b => b.item_id === request.item_id && b.borrower_id === request.requester && !b.returned);
        if (!borrowRecord) {
            alert('未找到对应的借出记录，可能已归还');
            await supabase.from('requests').delete().eq('id', requestId);
            await renderApp();
            return;
        }
        const { error } = await supabase.from('borrow_records').update({ returned: true }).eq('id', borrowRecord.id);
        if (error) { alert('归还确认失败：' + error.message); return; }
        await supabase.from('requests').delete().eq('id', requestId);
        await renderApp();
    }

    async function rejectRequest(requestId) {
        await supabase.from('requests').delete().eq('id', requestId);
        await renderApp();
    }

    // 启动
    renderApp();
})();