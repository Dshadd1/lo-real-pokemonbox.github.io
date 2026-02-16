// script.js
(function() {
    // ================== 配置区（保持不变） ==================
    const SUPABASE_URL = 'https://ktglukdrslxqirefbqvg.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0Z2x1a2Ryc2x4cWlyZWZicXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMTY0MTEsImV4cCI6MjA4NjU5MjQxMX0.PVMisfYM4BdlMcY-zV20PqP-sPoBwZg2BHGPHMjocFk';
    // =======================================================

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 全局状态
    let state = {
        items: [],
        borrowRecords: [],
        requests: [],
        // 不再需要 members
    };

    let currentUser = null;      // 存储完整的 user 对象
    let currentRole = 'anon';    // 'anon', 'authenticated', 或从 user_metadata 中取出的 'admin'

    // 存储搜索词
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

    // 监听认证状态变化
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            if (session) {
                currentUser = session.user;
                const metadata = currentUser?.user_metadata || {};
                // 判断角色：如果 metadata 中包含 role: admin，则是管理员
                currentRole = metadata.role === 'admin' ? 'admin' : 'authenticated';
            }
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentRole = 'anon';
        }
        // 重新渲染界面
        renderApp();
    });

    // 从云端拉取所有数据
    async function fetchAllData() {
        try {
            // 注意：RLS 策略会基于当前用户自动过滤数据
            const [itemsRes, borrowsRes, requestsRes] = await Promise.all([
                supabase.from('items').select('*'),
                supabase.from('borrow_records').select('*'),
                supabase.from('requests').select('*')
            ]);

            if (itemsRes.error) throw itemsRes.error;
            if (borrowsRes.error) throw borrowsRes.error;
            if (requestsRes.error) throw requestsRes.error;

            state.items = itemsRes.data || [];
            state.borrowRecords = borrowsRes.data || [];
            state.requests = requestsRes.data || [];
        } catch (err) {
            console.error('数据拉取失败:', err);
            alert('无法连接数据库，请检查网络或 Supabase 配置。');
        }
    }

    // 渲染入口
    async function renderApp() {
        await fetchAllData();
        const appDiv = document.getElementById('app');
        
        // 未登录或匿名
        if (!currentUser) {
            appDiv.innerHTML = renderLoginUI();
            attachLoginEvents();
            return;
        }
        
        // 已登录，根据角色渲染不同面板
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
                <h1 style="font-size: 2.2rem;">📦 工会宝可梦借还</h1>
                <p style="color: #3b6c7c;">请使用邮箱注册或登录</p>
            </div>
            <div class="login-section">
                <div class="login-card">
                    <h3>🔐 登录 / 注册</h3>
                    <input type="email" id="emailInput" placeholder="邮箱" autocomplete="off">
                    <input type="password" id="passwordInput" placeholder="密码">
                    <button id="signInBtn" style="margin-bottom: 8px;">🔑 登录</button>
                    <button id="signUpBtn" class="btn-outline">📝 注册新账号</button>
                    <p style="font-size:0.8rem; margin-top:12px;">注册后联系管理员设置角色</p>
                </div>
            </div>
            <div class="footer-note">by Dshadd</div>
        `;
    }

    // ---------- 会员主面板（与原逻辑类似，但使用 currentUser.id 作为标识）----------
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
                const borrowerEmail = activeBorrow ? (activeBorrow.user_email || '未知') : '未知';
                actionBtn = `<span style="color: #a06b53;">👤 ${borrowerEmail} 借出</span>`;
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
                <div class="badge">🧑 ${currentUser.email} (会员)</div>
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
            <div class="footer-note">✅ 数据云端存储，实时同步</div>
        `;
    }

    // ---------- 管理员面板（与原逻辑类似，增加会员管理界面简化）----------
    function renderAdminPanel() {
        const items = state.items;
        const borrows = state.borrowRecords.filter(b => !b.returned);
        const pendingRequests = state.requests.filter(r => r.status === 'pending');
        // 注意：不再有 members 表，管理员无法直接添加会员，但可以通过 Auth 页面添加

        // 物品表格（略，与之前相同）
        let itemRows = '';
        items.forEach(item => {
            const activeBorrow = borrows.find(b => b.item_id === item.id);
            const statusText = activeBorrow 
                ? `📆 借出日期: ${formatDate(activeBorrow.borrow_date)} (${activeBorrow.user_email || '未知'})` 
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

        // 待审批请求（略，与之前相同）
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
                        <div><strong>${itemName}</strong><br><span style="color: #3a6c7a;">申请人: ${req.user_email}  ·  ${reqTypeText}</span></div>
                        <div class="action-group">
                            ${approveBtn}
                            <button class="danger-btn reject-request-btn" data-requestid="${req.id}" style="width: auto; background: #9f7e6b;">❌ 拒绝</button>
                        </div>
                    </div>
                `;
            });
        }

        return `
            <div class="top-bar">
                <div class="badge">🛡️ 管理员：${currentUser.email}</div>
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

                <!-- 会员管理提示：会员通过 Auth 管理 -->
                <div style="margin-top: 30px; padding: 20px; background: #f0f7fa; border-radius: 20px;">
                    <h3>🧑‍🤝‍🧑 会员管理</h3>
                    <p>请在 Supabase 控制台的 <strong>Authentication → Users</strong> 中添加或删除用户。</p>
                    <p>新注册的会员默认角色为普通用户，如需设为管理员，请在控制台编辑其 User Metadata，添加 <code>{"role": "admin"}</code>。</p>
                </div>

                <div class="request-list">
                    <h3>⏳ 待审批请求</h3>
                    ${requestItems}
                </div>
            </div>
            <div class="footer-note">🔐 所有审批操作将立即更新云端</div>
        `;
    }

    // ---------- 登录事件绑定 ----------
    function attachLoginEvents() {
        document.getElementById('signInBtn')?.addEventListener('click', async () => {
            const email = document.getElementById('emailInput').value;
            const password = document.getElementById('passwordInput').value;
            if (!email || !password) { alert('请输入邮箱和密码'); return; }
            
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) alert('登录失败：' + error.message);
        });

        document.getElementById('signUpBtn')?.addEventListener('click', async () => {
            const email = document.getElementById('emailInput').value;
            const password = document.getElementById('passwordInput').value;
            if (!email || !password) { alert('请输入邮箱和密码'); return; }
            
            const { error } = await supabase.auth.signUp({ 
                email, 
                password,
                options: {
                    data: { role: 'authenticated' } // 默认角色
                }
            });
            if (error) {
                alert('注册失败：' + error.message);
            } else {
                alert('注册成功！请登录。');
            }
        });
    }

    // ---------- 主界面事件绑定（修改为使用 currentUser.id）----------
    function attachMainEvents() {
        // 登出
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

        // 归还请求
        document.querySelectorAll('.return-request-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = e.currentTarget.dataset.itemid;
                await createReturnRequest(itemId);
            });
        });

        // 撤回请求
        document.querySelectorAll('.withdraw-request-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const requestId = e.currentTarget.dataset.requestid;
                if (confirm('确定撤回该请求吗？')) {
                    await withdrawRequest(requestId);
                }
            });
        });

        // 管理员：增加物品
        document.getElementById('addItemBtn')?.addEventListener('click', async () => {
            const nameInp = document.getElementById('newItemName');
            const infoInp = document.getElementById('newItemInfo');
            const name = nameInp.value.trim();
            if (!name) { alert('请输入物品名称'); return; }
            const info = infoInp.value.trim() || '无描述';
            await addItem(name, info);
            nameInp.value = ''; infoInp.value = '';
        });

        // 管理员：编辑物品
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

        // 管理员：删除物品
        document.querySelectorAll('.delete-item-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = e.currentTarget.dataset.itemid;
                if (confirm('确定删除该物品吗？')) {
                    await deleteItem(itemId);
                }
            });
        });

        // 审批操作
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

        // 搜索框（略，与之前相同）
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

    // ---------- 云端操作函数（需适配 user_id）----------
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

    // 启动应用
    renderApp();
})();