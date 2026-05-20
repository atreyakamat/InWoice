import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, FileText, Users, PieChart, Settings, PlusCircle, Package, LogOut, Landmark, Mail, BookOpen, CheckSquare, Megaphone, Bot, ShoppingCart } from 'lucide-react';
import { removeToken } from '../apiConfig';

const Sidebar = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const links = [
        { name: 'Dashboard', path: '/', icon: Home },
        { name: 'AI Manager', path: '/ai-manager', icon: Bot },
        { name: 'WhatsApp Orders', path: '/orders', icon: ShoppingCart },
        { name: 'Inbox', path: '/mail', icon: Mail },
        { name: 'Marketing', path: '/marketing', icon: Megaphone },
        { name: 'Create Invoice', path: '/create-invoice', icon: PlusCircle },
        { name: 'Invoices', path: '/invoices', icon: FileText },
        { name: 'Accounting', path: '/accounting', icon: BookOpen },
        { name: 'Tasks', path: '/tasks', icon: CheckSquare },
        { name: 'Banking', path: '/reconciliation', icon: Landmark },
        { name: 'Products', path: '/products', icon: Package },
        { name: 'Customers', path: '/customers', icon: Users },
        { name: 'Analytics', path: '/analytics', icon: PieChart },
        { name: 'Settings', path: '/settings', icon: Settings },
    ];

    const handleLogout = () => {
        removeToken();
        navigate('/login');
    };

    return (
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
            <div className="p-6">
                <h1 className="text-xl font-bold text-purple-600">Stix N Vibes</h1>
                <p className="text-xs text-gray-500 mt-1">Invoice Manager</p>
            </div>
            <nav className="flex-1 px-4 space-y-2">
                {links.map((link) => {
                    const Icon = link.icon;
                    const isActive = location.pathname === link.path;
                    return (
                        <Link
                            key={link.path}
                            to={link.path}
                            className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                                isActive ? 'bg-purple-100 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            <Icon size={20} />
                            <span>{link.name}</span>
                        </Link>
                    );
                })}
            </nav>
            
            {/* Logout Button */}
            <div className="p-4 border-t border-gray-200">
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                >
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
            
            <div className="p-4 border-t border-gray-200 text-sm text-center text-gray-500">
                &copy; {new Date().getFullYear()} Stix N Vibes
            </div>
        </div>
    );
};

export default Sidebar;
