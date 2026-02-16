// script.js (完整版，支持注册审核，初始密码固定为 pokemmo123456)
(function() {
    const SUPABASE_URL = 'https://ktglukdrslxqirefbqvg.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0Z2x1a2Ryc2x4cWlyZWZicXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMTY0MTEsImV4cCI6MjA4NjU5MjQxMX0.PVMisfYM4BdlMcY-zV20PqP-sPoBwZg2BHGPHMjocFk';

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 全局状态
    let state = {
        items: [],
        borrowRecords: [],
        requests: [],
        registrationRequests: []
    };

    let currentUser = null;
    let currentRole = 'anon';
    let currentUsername = null;

    let memberSearchTerm = '';
    let adminSearchTerm = '';

    // ---------- 辅助函数 ----------
    function formatDate(timestamp) {
        if (!timestamp) return '未知日期';
        const date = new Date(timestamp);
        return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    }

    function generateId(prefix = '') {
        return prefix + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    }

    // 获取当前用户名
    async function fetchCurrentUsername() {
        if (!currentUser) return null;
        if (currentUsername) return currentUsername;
        const { data, error } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', currentUser.id)
            .single();
        if (error) {
            console.error('获取用户名失败:', error);
            return null;
        }
        currentUsername = data.username;
        return currentUsername;
    }

    // 监听认证状态
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            if (session) {
                currentUser = session.user;
                const metadata = currentUser?.user_metadata || {};
                currentRole = metadata.role === 'admin' ? 'admin' : 'authenticated';
            }
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentRole = 'anon';
            currentUsername = null;
        }
        renderApp();
    });

    // 从云端拉取所有数据
    async function fetchAllData() {
        try {
            const [itemsRes, borrowsRes, requestsRes, regReqsRes] = await Promise.all([
                supabase.from('items').select('*'),
                supabase.from('borrow_records').select('*'),
                supabase.from('requests').select('*'),
                supabase.from('registration_requests').select('*').eq('status', 'pending')
            ]);

            if (itemsRes.error) throw itemsRes.error;
            if (borrowsRes.error) throw borrowsRes.error;
            if (requestsRes.error) throw requestsRes.error;
            if (regReqsRes.error) throw regReqsRes.error;

            state.items = itemsRes.data || [];
            state.borrowRecords = borrowsRes.data || [];
            state.requests = requestsRes.data || [];
            state.registrationRequests = regReqsRes.data || [];
        } catch (err) {
            console.error('数据拉取失败:', err);
            alert('无法连接数据库，请检查网络或 Supabase 配置。');
        }
    }

    // 渲染入口
    async function renderApp() {
        await fetchAllData();
        if (currentUser) {
            await fetchCurrentUsername();
        }

        const appDiv = document.getElementById('app');
        
        if (!currentUser) {
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

    // ---------- 登录界面 ----------
    function renderLoginUI() {
        return `
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="font-size: 2.2rem;">📦 公会宝可梦借还</h1>
                <p style="color: #3b6c7c;">请使用用户名或邮箱登录，新用户请提交注册申请</p>
            </div>
            <div class="login-section">
                <div class="login-card">
                    <h3>🔐 登录</h3>
                    <input type="text" id="loginIdentifier" placeholder="用户名 或 邮箱" autocomplete="off">
                    <input type="password" id="passwordInput" placeholder="密码">
                    <button id="signInBtn">🔑 登录</button>
                </div>
                <div class="login-card">
                    <h3>📝 注册申请</h3>
                    <input type="text" id="regUsername" placeholder="想要的用户名" autocomplete="off">
                    <input type="email" id="regEmail" placeholder="邮箱" autocomplete="off">
                    <button id="submitRegRequestBtn" class="btn-outline">📨 提交注册申请</button>
                    <p style="font-size:0.8rem; margin-top:12px;">申请后请等待管理员审核</p>
                </div>
            </div>
            <div class="footer-note">by Dshadd</div>
        `;
    }

    // ---------- 成员主面板 ----------
    function renderMemberPanel() {
        const items = state.items;
        const borrows = state.borrowRecords.filter(b => !b.returned);
        const requests = state.requests.filter(r => r.status === 'pending');

        function getItemStatus(itemId) {
            const activeBorrow = borrows.find(b => b.item_id === itemId);
            if (activeBorrow) return `📆 借出日期: ${formatDate(activeBorrow.borrow_date)}`;
            return '✅ 未借';
        }

        let tableRows = '';
        items.forEach(item => {
            const statusText = getItemStatus(item.id);
            const isBorrowed = borrows.some(b => b.item_id === item.id);
            const activeBorrow = borrows.find(b => b.item_id === item.id);
            const borrowedByMe = activeBorrow && activeBorrow.user_id === currentUser.id;
            const hasPendingBorrowRequest = requests.some(r => r.item_id === item.id && r.type === 'borrow');
            
            const myPendingBorrowReq = requests.find(r => r.item_id === item.id && r.user_id === currentUser.id && r.type === 'borrow');
            const myPendingReturnReq = requests.find(r => r.item_id === item.id && r.user_id === currentUser.id && r.type === 'return');
            
            const myPendingBorrow = !!myPendingBorrowReq;
            const myPendingReturn = !!myPendingReturnReq;

            let actionBtn = '';
            if (!isBorrowed && !hasPendingBorrowRequest) {
                actionBtn = `<button class="btn-outline borrow-request-btn" data-itemid="${item.id}" style="width: auto;">📨 借用请求</button>`;
            } else if (!isBorrowed && hasPendingBorrowRequest) {
                if (myPendingBorrow) {
                    actionBtn = `
                        <span style="color: #8a9fa5;">⏳ 请求已提交</span>
                        <button class="withdraw-btn withdraw-request-btn" data-requestid="${myPendingBorrowReq.id}">✖ 撤回</button>
                    `;
                } else {
                    actionBtn = `<span style="color: #b2876f;">🔒 他人已申请</span>`;
                }
            } else if (isBorrowed && borrowedByMe) {
                if (myPendingReturn) {
                    actionBtn = `
                        <span style="color: #8a9fa5;">⏳ 归还请求中</span>
                        <button class="withdraw-btn withdraw-request-btn" data-requestid="${myPendingReturnReq.id}">✖ 撤回</button>
                    `;
                } else {
                    actionBtn = `<button class="btn-outline return-request-btn" data-itemid="${item.id}" style="width: auto; background: #f8e3cd;">↩️ 归还请求</button>`;
                }
            } else if (isBorrowed && !borrowedByMe) {
                const borrowerUsername = activeBorrow ? (activeBorrow.username || '未知') : '未知';
                actionBtn = `<span style="color: #a06b53;">👤 ${borrowerUsername} 借出</span>`;
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
                <div class="badge">🧑 ${currentUsername || currentUser.email} (成员)</div>
                <button id="logoutBtn" class="logout-btn">🚪 登出</button>
            </div>
            <div class="main-panel">
                <h2>📋 可借物品清单</h2>
                <input type="text" id="member-search" class="search-box" placeholder="🔍 搜索物品名称或信息..." value="${memberSearchTerm.replace(/"/g, '&quot;')}">
                <div class="table-container">
                    <table id="member-items-table">
                        <thead><tr><th>物品名称</th><th>详细信息</th><th>状态</th><th>操作</th></tr></thead>
                        <tbody>${tableRows || '<tr><td colspan="4" class="empty-msg">暂无物品</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
            <div class="footer-note"></div>
        `;
    }

    // ---------- 管理员面板 ----------
    function renderAdminPanel() {
        const items = state.items;
        const borrows = state.borrowRecords.filter(b => !b.returned);
        const pendingRequests = state.requests.filter(r => r.status === 'pending');
        const pendingRegs = state.registrationRequests;

        // 物品表格
        let itemRows = '';
        items.forEach(item => {
            const activeBorrow = borrows.find(b => b.item_id === item.id);
            const statusText = activeBorrow 
                ? `📆 借出日期: ${formatDate(activeBorrow.borrow_date)} (${activeBorrow.username || activeBorrow.user_email || '未知'})` 
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

        // 待审批借用/归还请求
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
                        <div><strong>${itemName}</strong><br><span style="color: #3a6c7a;">申请人: ${req.username || req.user_email || '未知'}  ·  ${reqTypeText}</span></div>
                        <div class="action-group">
                            ${approveBtn}
                            <button class="danger-btn reject-request-btn" data-requestid="${req.id}" style="width: auto; background: #9f7e6b;">❌ 拒绝</button>
                        </div>
                    </div>
                `;
            });
        }

        // 待审批注册请求
        let regRequestItems = '';
        if (pendingRegs.length === 0) {
            regRequestItems = `<div class="empty-msg">📭 暂无注册申请</div>`;
        } else {
            pendingRegs.forEach(req => {
                regRequestItems += `
                    <div class="request-item" style="border-left-color: #f0ad4e;">
                        <div><strong>${req.username}</strong><br><span style="color: #3a6c7a;">邮箱: ${req.email}</span></div>
                        <div class="action-group">
                            <button class="success-btn approve-reg-btn" data-reqid="${req.id}" data-username="${req.username}" data-email="${req.email}" style="width: auto;">✅ 通过</button>
                            <button class="danger-btn reject-reg-btn" data-reqid="${req.id}" style="width: auto; background: #9f7e6b;">❌ 拒绝</button>
                        </div>
                    </div>
                `;
            });
        }

        return `
            <div class="top-bar">
                <div class="badge">🛡️ 管理员：${currentUsername || currentUser.email}</div>
                <button id="logoutBtn" class="logout-btn">🚪 登出</button>
            </div>
            <div class="main-panel">
                <h2>🛠️ 管理精灵库</h2>
                <div class="admin-add">
                    <input type="text" id="newItemName" placeholder="物品名称">
                    <input type="text" id="newItemInfo" placeholder="物品信息/描述">
                    <button id="addItemBtn" class="success-btn" style="width: auto; padding: 12px 28px;">➕ 增加物品</button>
                </div>
                <input type="text" id="admin-search" class="search-box" placeholder="🔍 搜索物品名称或信息..." value="${adminSearchTerm.replace(/"/g, '&quot;')}">
                <div class="table-container">
                    <table id="admin-items-table">
                        <thead><tr><th>名称</th><th>信息</th><th>状态(借用人)</th><th>操作</th></tr></thead>
                        <tbody>${itemRows || '<tr><td colspan="4" class="empty-msg">暂无物品，请添加</td></tr>'}</tbody>
                    </table>
                </div>

                <!-- 注册请求管理 -->
                <div style="margin-top: 30px;">
                    <h3>📋 待审批注册申请</h3>
                    <div class="request-list" style="margin-top: 10px;">
                        ${regRequestItems}
                    </div>
                </div>

                <!-- 借用/归还请求管理 -->
                <div class="request-list">
                    <h3>⏳ 待审批借用/归还请求</h3>
                    ${requestItems}
                </div>

                <!-- 成员管理提示 -->
                <div style="margin-top: 30px; padding: 20px; background: #f0f7fa; border-radius: 20px;">
                    <h3>🧑‍🤝‍🧑 成员管理</h3>
                    <p>已注册的用户在 <strong>Authentication → Users</strong> 中管理。</p>
                </div>
            </div>
            <div class="footer-note"></div>
        `;
    }

    // ---------- 登录/注册请求事件绑定 ----------
    function attachLoginEvents() {
        document.getElementById('signInBtn')?.addEventListener('click', async () => {
            const identifier = document.getElementById('loginIdentifier').value;
            const password = document.getElementById('passwordInput').value;
            await handleSignIn(identifier, password);
        });

        document.getElementById('submitRegRequestBtn')?.addEventListener('click', async () => {
            const username = document.getElementById('regUsername').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            await createRegistrationRequest(username, email);
        });
    }

    async function handleSignIn(identifier, password) {
        if (!identifier || !password) { alert('请输入用户名/邮箱和密码'); return; }
        
        let email = identifier;
        if (!identifier.includes('@')) {
            const { data, error } = await supabase
                .from('profiles')
                .select('email')
                .eq('username', identifier)
                .maybeSingle();
            if (error || !data) {
                alert('用户名不存在');
                return;
            }
            email = data.email;
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) alert('登录失败：' + error.message);
    }

    // 创建注册申请
    async function createRegistrationRequest(username, email) {
        if (!username || !email) { alert('请填写用户名和邮箱'); return; }
        // 检查用户名/邮箱是否已存在
        const { data: existingProfile, error: profileError } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', username)
            .maybeSingle();
        if (profileError) { alert('验证失败：' + profileError.message); return; }
        if (existingProfile) { alert('用户名已存在'); return; }

        const { data: existingEmail, error: emailError } = await supabase
            .from('profiles')
            .select('email')
            .eq('email', email)
            .maybeSingle();
        if (emailError) { alert('验证失败：' + emailError.message); return; }
        if (existingEmail) { alert('邮箱已被注册'); return; }

        // 检查是否有待处理的申请
        const { data: pendingReq } = await supabase
            .from('registration_requests')
            .select('id')
            .eq('username', username)
            .eq('status', 'pending')
            .maybeSingle();
        if (pendingReq) { alert('该用户名已有待审核的申请'); return; }

        const { error } = await supabase
            .from('registration_requests')
            .insert([{ username, email, status: 'pending' }]);
        if (error) {
            alert('提交失败：' + error.message);
        } else {
            alert('注册申请已提交，请等待管理员审核');
            document.getElementById('regUsername').value = '';
            document.getElementById('regEmail').value = '';
        }
    }

    // ---------- 主界面事件绑定 ----------
    function attachMainEvents() {
        document.getElementById('logoutBtn')?.addEventListener('click', async () => {
            await supabase.auth.signOut();
        });

        // 借用请求
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
        document.querySelectorAll('.withdraw-request-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const requestId = e.currentTarget.dataset.requestid;
                if (confirm('确定撤回该请求吗？')) {
                    await withdrawRequest(requestId);
                }
            });
        });

        // 管理员：物品管理
        document.getElementById('addItemBtn')?.addEventListener('click', async () => {
            const nameInp = document.getElementById('newItemName');
            const infoInp = document.getElementById('newItemInfo');
            const name = nameInp.value.trim();
            if (!name) { alert('请输入物品名称'); return; }
            const info = infoInp.value.trim() || '无描述';
            await addItem(name, info);
            nameInp.value = ''; infoInp.value = '';
        });
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

        // 审批借用/归还请求
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

        // 审批注册请求（关键修改：固定初始密码）
        document.querySelectorAll('.approve-reg-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const reqId = e.currentTarget.dataset.reqid;
                const username = e.currentTarget.dataset.username;
                const email = e.currentTarget.dataset.email;
                if (confirm(`通过用户 ${username} 的注册申请？系统将为其创建账号，初始密码统一为 pokemmo123456。请务必私下告知用户。`)) {
                    await approveRegistration(reqId, username, email);
                }
            });
        });
        document.querySelectorAll('.reject-reg-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const reqId = e.currentTarget.dataset.reqid;
                if (confirm('确定拒绝该注册申请吗？')) {
                    await rejectRegistration(reqId);
                }
            });
        });

        // 搜索框
        const memberSearch = document.getElementById('member-search');
        if (memberSearch) {
            memberSearch.value = memberSearchTerm;
            memberSearch.addEventListener('input', (e) => {
                memberSearchTerm = e.target.value;
                filterTable('member-items-table', memberSearchTerm);
            });
            filterTable('member-items-table', memberSearchTerm);
        }
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

    // ---------- 注册审批函数（使用固定密码）----------
    async function approveRegistration(reqId, username, email) {
        // 固定初始密码
        const password = 'pokemmo123456';

        // 调用 Supabase Auth 创建用户
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { role: 'authenticated' }
            }
        });

        if (error) {
            alert('创建用户失败：' + error.message);
            return;
        }

        // 创建 profiles 记录
        const { error: profileError } = await supabase
            .from('profiles')
            .insert([{ id: data.user.id, username, email }]);

        if (profileError) {
            alert('创建用户资料失败：' + profileError.message);
            return;
        }

        // 更新注册请求状态为 approved
        await supabase
            .from('registration_requests')
            .update({ status: 'approved' })
            .eq('id', reqId);

        alert(`用户 ${username} 创建成功！初始密码为：${password}\n请务必告知用户此密码，并提醒其登录后修改密码。`);
        await renderApp();
    }

    async function rejectRegistration(reqId) {
        await supabase
            .from('registration_requests')
            .update({ status: 'rejected' })
            .eq('id', reqId);
        await renderApp();
    }

    // ---------- 其他云端操作函数（与之前相同）----------
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

        const { error: borrowDeleteError } = await supabase.from('borrow_records').delete().eq('item_id', itemId);
        if (borrowDeleteError) { alert('删除借阅记录失败：' + borrowDeleteError.message); return; }
        const { error: requestDeleteError } = await supabase.from('requests').delete().eq('item_id', itemId);
        if (requestDeleteError) { alert('删除请求失败：' + requestDeleteError.message); return; }
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
        const myExist = state.requests.find(r => r.item_id === itemId && r.user_id === currentUser.id && r.type === 'borrow' && r.status === 'pending');
        if (myExist) { alert('你已经提交过借用请求'); return; }

        const newReq = {
            id: generateId('req-'),
            item_id: itemId,
            user_id: currentUser.id,
            user_email: currentUser.email,
            username: currentUsername,
            type: 'borrow',
            status: 'pending',
            request_date: Date.now()
        };
        const { error } = await supabase.from('requests').insert([newReq]);
        if (error) { alert('提交失败：' + error.message); return; }
        await renderApp();
    }

    async function createReturnRequest(itemId) {
        const activeBorrow = state.borrowRecords.find(b => b.item_id === itemId && !b.returned && b.user_id === currentUser.id);
        if (!activeBorrow) { alert('你没有借用此物品或已归还'); return; }
        const pendingReturn = state.requests.find(r => r.item_id === itemId && r.user_id === currentUser.id && r.type === 'return' && r.status === 'pending');
        if (pendingReturn) { alert('归还请求已提交，请勿重复'); return; }

        const newReq = {
            id: generateId('req-'),
            item_id: itemId,
            user_id: currentUser.id,
            user_email: currentUser.email,
            username: currentUsername,
            type: 'return',
            status: 'pending',
            request_date: Date.now()
        };
        const { error } = await supabase.from('requests').insert([newReq]);
        if (error) { alert('提交失败：' + error.message); return; }
        await renderApp();
    }

    async function withdrawRequest(requestId) {
        const { error } = await supabase.from('requests').delete().eq('id', requestId);
        if (error) { alert('撤回失败：' + error.message); return; }
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
            user_id: request.user_id,
            user_email: request.user_email,
            username: request.username,
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
        const borrowRecord = state.borrowRecords.find(b => b.item_id === request.item_id && b.user_id === request.user_id && !b.returned);
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

    renderApp();
})();