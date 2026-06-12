import React, { useEffect, useState } from 'react';
import { api, API_ENDPOINTS } from '../apiConfig';
import { Plus, CheckCircle } from 'lucide-react';
import { toast } from 'react-toastify';

const STATUSES = ['Todo', 'In Progress', 'Done'];

const Tasks = () => {
    const [tasks, setTasks] = useState([]);
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        status: 'Todo',
        assignee: '',
        dueDate: ''
    });

    const fetchTasks = async () => {
        try {
            const data = await api.get(API_ENDPOINTS.TASKS.LIST);
            setTasks(data || []);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load tasks.');
        }
    };

    useEffect(() => {
        fetchTasks();
    }, []);

    const handleCreate = async () => {
        if (!newTask.title.trim()) {
            toast.error('Task title is required.');
            return;
        }
        try {
            const created = await api.post(API_ENDPOINTS.TASKS.LIST, newTask);
            setTasks(prev => [created, ...prev]);
            setNewTask({ title: '', description: '', status: 'Todo', assignee: '', dueDate: '' });
        } catch (error) {
            console.error(error);
            toast.error('Failed to create task.');
        }
    };

    const handleUpdate = async (taskId, updates) => {
        try {
            const updated = await api.patch(API_ENDPOINTS.TASKS.UPDATE(taskId), updates);
            if (updated) {
                setTasks(prev => prev.map(task => task.id === taskId ? { ...task, ...updates } : task));
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to update task.');
        }
    };

    const renderColumn = (status) => (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex-1 min-w-[260px]">
            <h3 className="text-sm font-bold text-gray-700 mb-4">{status}</h3>
            <div className="space-y-3">
                {tasks.filter(task => task.status === status).map(task => (
                    <div key={task.id} className="p-3 rounded-lg border border-gray-100 bg-gray-50">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="text-sm font-semibold text-gray-800">{task.title}</h4>
                                {task.description && <p className="text-xs text-gray-500 mt-1">{task.description}</p>}
                            </div>
                            {task.status === 'Done' && <CheckCircle size={16} className="text-green-500" />}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                            {task.assignee && <span className="px-2 py-1 bg-white rounded">@{task.assignee}</span>}
                            {task.dueDate && <span className="px-2 py-1 bg-white rounded">Due {task.dueDate}</span>}
                        </div>
                        <div className="mt-3">
                            <select
                                value={task.status}
                                onChange={(e) => handleUpdate(task.id, { ...task, status: e.target.value })}
                                className="w-full text-xs p-2 rounded border border-gray-200 bg-white"
                            >
                                {STATUSES.map(option => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Tasks</h1>
                    <p className="text-sm text-gray-500">Track work across your business operations</p>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <input
                        type="text"
                        placeholder="Task title"
                        value={newTask.title}
                        onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                        className="p-2 border rounded-lg text-sm"
                    />
                    <input
                        type="text"
                        placeholder="Description"
                        value={newTask.description}
                        onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                        className="p-2 border rounded-lg text-sm"
                    />
                    <input
                        type="text"
                        placeholder="Assignee"
                        value={newTask.assignee}
                        onChange={(e) => setNewTask(prev => ({ ...prev, assignee: e.target.value }))}
                        className="p-2 border rounded-lg text-sm"
                    />
                    <input
                        type="date"
                        value={newTask.dueDate}
                        onChange={(e) => setNewTask(prev => ({ ...prev, dueDate: e.target.value }))}
                        className="p-2 border rounded-lg text-sm"
                    />
                    <button
                        onClick={handleCreate}
                        className="flex items-center justify-center space-x-2 bg-purple-600 text-white rounded-lg text-sm font-semibold"
                    >
                        <Plus size={16} />
                        <span>Add Task</span>
                    </button>
                </div>
            </div>

            <div className="flex gap-4 flex-col lg:flex-row">
                {STATUSES.map(status => renderColumn(status))}
            </div>
        </div>
    );
};

export default Tasks;
