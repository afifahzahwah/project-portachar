/**
 * PortaChar Authentication & Session Client Engine
 * Supports both Live Node.js/Python SQLite Backend and Static Netlify/Cloud Hosting.
 * Seamlessly fails over to client-side persistence if server APIs are unreachable.
 */
(function(window) {
    'use strict';

    var STORAGE_TOKEN_KEY = 'portachar_auth_token';
    var STORAGE_USER_KEY = 'portachar_auth_user';
    var STORAGE_CLIENT_DB_KEY = 'portachar_client_users';

    // Seed default users for static deployments (e.g. Netlify)
    function getClientDB() {
        var raw = localStorage.getItem(STORAGE_CLIENT_DB_KEY);
        if (raw) {
            try {
                return JSON.parse(raw);
            } catch (e) {}
        }
        var defaultUsers = [
            { id: 1, username: 'admin', role: 'admin', password: 'admin123', created_at: '2026-09-23 09:00:00' },
            { id: 2, username: 'operator', role: 'operator', password: 'operator123', created_at: '2026-09-23 09:15:00' },
            { id: 3, username: 'zahwah', role: 'viewer', password: 'password123', created_at: '2026-09-23 09:45:00' }
        ];
        localStorage.setItem(STORAGE_CLIENT_DB_KEY, JSON.stringify(defaultUsers));
        return defaultUsers;
    }

    function saveClientDB(users) {
        localStorage.setItem(STORAGE_CLIENT_DB_KEY, JSON.stringify(users));
    }

    var Auth = {
        getToken: function() {
            return localStorage.getItem(STORAGE_TOKEN_KEY) || '';
        },

        setToken: function(token) {
            if (token) {
                localStorage.setItem(STORAGE_TOKEN_KEY, token);
            } else {
                localStorage.removeItem(STORAGE_TOKEN_KEY);
            }
        },

        getUser: function() {
            var raw = localStorage.getItem(STORAGE_USER_KEY);
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        },

        setUser: function(user) {
            if (user) {
                localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
            } else {
                localStorage.removeItem(STORAGE_USER_KEY);
            }
        },

        clear: function() {
            localStorage.removeItem(STORAGE_TOKEN_KEY);
            localStorage.removeItem(STORAGE_USER_KEY);
        },

        getHeaders: function() {
            var headers = {
                'Content-Type': 'application/json'
            };
            var token = this.getToken();
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            return headers;
        },

        checkAuth: function(options) {
            options = options || {};
            var self = this;
            var redirectToLogin = options.redirectToLogin !== false;
            var requiredRole = options.requiredRole;

            // Direct check against API server
            return fetch('/api/auth/me', {
                method: 'GET',
                headers: self.getHeaders(),
                credentials: 'include'
            })
            .then(function(res) {
                if (!res.ok) throw new Error('API server returned ' + res.status);
                return res.json();
            })
            .then(function(data) {
                if (data && data.authenticated && data.user) {
                    self.setUser(data.user);
                    self.updateUI(data.user);

                    if (requiredRole && data.user.role !== requiredRole && data.user.role !== 'admin') {
                        alert('Access restricted. Required role: ' + requiredRole);
                        window.location.href = 'index.html';
                        return { authenticated: false, restricted: true };
                    }
                    return data;
                } else {
                    self.clear();
                    if (redirectToLogin && !window.location.pathname.endsWith('login.html')) {
                        window.location.href = 'login.html';
                    }
                    return { authenticated: false };
                }
            })
            .catch(function(err) {
                // Failover mode: Static hosting (Netlify) or file:// protocol
                var cached = self.getUser();
                var token = self.getToken();

                if (token && cached) {
                    self.updateUI(cached);
                    if (requiredRole && cached.role !== requiredRole && cached.role !== 'admin') {
                        alert('Access restricted. Required role: ' + requiredRole);
                        window.location.href = 'index.html';
                        return { authenticated: false, restricted: true };
                    }
                    return { authenticated: true, user: cached, mode: 'client_fallback' };
                }

                if (redirectToLogin && !window.location.pathname.endsWith('login.html')) {
                    window.location.href = 'login.html';
                }
                return { authenticated: false, error: err };
            });
        },

        login: function(username, password) {
            var self = this;
            username = (username || '').trim();
            password = (password || '').trim();

            return fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            })
            .then(function(res) {
                if (res.status === 404) {
                    throw new Error('API_NOT_FOUND');
                }
                return res.json().then(function(data) {
                    if (!res.ok) {
                        return { success: false, error: data.error || 'Login failed' };
                    }
                    if (data.token) self.setToken(data.token);
                    if (data.user) self.setUser(data.user);
                    return { success: true, user: data.user, token: data.token };
                });
            })
            .catch(function(err) {
                // Client-side fallback authentication for Netlify deployment
                var dbUsers = getClientDB();
                var match = null;
                for (var i = 0; i < dbUsers.length; i++) {
                    if (dbUsers[i].username.toLowerCase() === username.toLowerCase() && dbUsers[i].password === password) {
                        match = dbUsers[i];
                        break;
                    }
                }

                if (match) {
                    var token = 'client_token_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
                    var userObj = { id: match.id, username: match.username, role: match.role };
                    self.setToken(token);
                    self.setUser(userObj);
                    return { success: true, user: userObj, token: token, mode: 'static_fallback' };
                }

                return { success: false, error: 'Invalid username or password' };
            });
        },

        logout: function() {
            var self = this;
            fetch('/api/auth/logout', {
                method: 'POST',
                headers: self.getHeaders(),
                credentials: 'include'
            }).finally(function() {
                self.clear();
                window.location.href = 'login.html';
            });
        },

        getUsers: function() {
            var self = this;
            return fetch('/api/users', {
                method: 'GET',
                headers: self.getHeaders(),
                credentials: 'include'
            })
            .then(function(res) {
                if (!res.ok) throw new Error('API_UNAVAILABLE');
                return res.json();
            })
            .catch(function() {
                // Fallback for Netlify deployment
                var dbUsers = getClientDB();
                var safeList = dbUsers.map(function(u) {
                    return { id: u.id, username: u.username, role: u.role, created_at: u.created_at };
                });
                return { success: true, users: safeList };
            });
        },

        createUser: function(username, password, role) {
            var self = this;
            return fetch('/api/users', {
                method: 'POST',
                headers: self.getHeaders(),
                credentials: 'include',
                body: JSON.stringify({
                    username: username,
                    password: password,
                    role: role || 'operator'
                })
            })
            .then(function(res) {
                if (res.status === 404) throw new Error('API_UNAVAILABLE');
                return res.json();
            })
            .catch(function() {
                // Fallback for Netlify deployment
                var dbUsers = getClientDB();
                for (var i = 0; i < dbUsers.length; i++) {
                    if (dbUsers[i].username.toLowerCase() === username.toLowerCase()) {
                        return { success: false, error: 'Username "' + username + '" is already registered.' };
                    }
                }
                var newId = dbUsers.length ? Math.max.apply(null, dbUsers.map(function(u) { return u.id; })) + 1 : 1;
                var now = new Date().toISOString().replace('T', ' ').slice(0, 19);
                var newUser = {
                    id: newId,
                    username: username,
                    password: password,
                    role: role || 'operator',
                    created_at: now
                };
                dbUsers.push(newUser);
                saveClientDB(dbUsers);
                return { success: true, user: { id: newId, username: username, role: role }, message: 'User created' };
            });
        },

        deleteUser: function(userId) {
            var self = this;
            return fetch('/api/users/delete', {
                method: 'POST',
                headers: self.getHeaders(),
                credentials: 'include',
                body: JSON.stringify({ id: userId })
            })
            .then(function(res) {
                if (res.status === 404) throw new Error('API_UNAVAILABLE');
                return res.json();
            })
            .catch(function() {
                // Fallback for Netlify deployment
                var curr = self.getUser();
                if (curr && curr.id === Number(userId)) {
                    return { success: false, error: 'Cannot delete your own active account.' };
                }
                var dbUsers = getClientDB();
                var target = null;
                var filtered = [];
                for (var i = 0; i < dbUsers.length; i++) {
                    if (dbUsers[i].id === Number(userId)) {
                        target = dbUsers[i];
                    } else {
                        filtered.push(dbUsers[i]);
                    }
                }
                if (!target) return { success: false, error: 'User not found.' };
                saveClientDB(filtered);
                return { success: true, message: 'User "' + target.username + '" deleted successfully.' };
            });
        },

        updateUI: function(user) {
            if (!user) return;
            var userNames = document.querySelectorAll('.current-user-name, #navbar_user_name');
            userNames.forEach(function(el) {
                el.textContent = user.username;
            });

            var roleBadges = document.querySelectorAll('.current-user-role, #navbar_user_role');
            roleBadges.forEach(function(el) {
                el.textContent = user.role.toUpperCase();
                if (user.role === 'admin') {
                    el.className = 'badge bg-danger rounded-pill';
                } else if (user.role === 'viewer') {
                    el.className = 'badge bg-secondary rounded-pill';
                } else {
                    el.className = 'badge bg-teal rounded-pill';
                }
            });
        }
    };

    // Auto-bind logout buttons across the document
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.btn-logout, #btn_logout').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                if (confirm('Are you sure you want to log out from PortaChar?')) {
                    Auth.logout();
                }
            });
        });
    });

    window.PortaCharAuth = Auth;

})(window);
