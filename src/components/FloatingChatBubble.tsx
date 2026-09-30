import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, LifeBuoy, X, Send, ExternalLink } from 'lucide-react';
import { useToast } from './Toast.tsx';

interface FloatingChatBubbleProps {
  onNavigateSupport: () => void;
}

const STORAGE_KEY = 'victus_chat_bubble_pos_v2';
const BUBBLE_SIZE = 54; // px
const MARGIN = 12; // margin from frame edges
const TOP_BAR_HEIGHT = 60;
const DOCK_BAR_HEIGHT = 68;

// Clamp within the app frame (the nearest positioned ancestor), not the window,
// so the bubble never escapes the phone shell on desktop.
function clampToFrame(x: number, y: number): { x: number; y: number } {
  const frame = document.querySelector('.app-shell');
  const w = frame ? frame.clientWidth : window.innerWidth;
  const h = frame ? frame.clientHeight : window.innerHeight;
  const minX = MARGIN;
  const maxX = Math.max(MARGIN, w - BUBBLE_SIZE - MARGIN);
  const minY = TOP_BAR_HEIGHT + 8;
  const maxY = Math.max(minY, h - DOCK_BAR_HEIGHT - BUBBLE_SIZE - MARGIN);
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

export const FloatingChatBubble: React.FC<FloatingChatBubbleProps> = ({ onNavigateSupport }) => {
  const { showToast } = useToast();
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const fallback = { x: 280, y: 500 };
    let candidate = fallback;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          candidate = parsed;
        }
      }
    } catch {
      // fallback
    }
    // Clamp restored OR default positions to the app frame so a saved
    // position from a bigger screen can never render the bubble off-screen.
    if (typeof window === 'undefined') return candidate;
    return clampToFrame(candidate.x, candidate.y);
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([
    {
      sender: 'bot',
      text: 'Hello! Victus Cloud Support is available 24/7. How can we help your server today?',
      time: 'Just now',
    },
  ]);

  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initialBubbleX: number;
    initialBubbleY: number;
    hasMoved: boolean;
  }>({
    startX: 0,
    startY: 0,
    initialBubbleX: 0,
    initialBubbleY: 0,
    hasMoved: false,
  });

  // Clamp bubble position within the app frame (falls back to viewport)
  const clampPosition = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') return { x, y };
    return clampToFrame(x, y);
  }, []);

  // Ensure position stays in bounds on resize/orientation change
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const clamped = clampPosition(prev.x, prev.y);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
        } catch {
          // Storage may be unavailable (private mode); clamping still applies.
        }
        return clamped;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cancel a pending simulated reply when the chat bubble unmounts.
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (replyTimerRef.current !== null) clearTimeout(replyTimerRef.current);
    },
    []
  );

  // Pointer event handlers for silky drag + drop across touch and mouse
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // Only primary button
    if (e.button !== 0) return;

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialBubbleX: position.x,
      initialBubbleY: position.y,
      hasMoved: false,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > 5) {
      dragStartRef.current.hasMoved = true;
    }

    const nextX = dragStartRef.current.initialBubbleX + deltaX;
    const nextY = dragStartRef.current.initialBubbleY + deltaY;
    const clamped = clampPosition(nextX, nextY);

    setPosition(clamped);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }

    setIsDragging(false);

    // Save final position to localStorage
    const finalPos = clampPosition(position.x, position.y);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finalPos));
    } catch {
      // Ignored
    }

    // Tap detection: if barely moved, treat as a tap/click
    if (!dragStartRef.current.hasMoved) {
      setIsChatModalOpen(true);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    const userText = chatMessage.trim();
    setChatMessage('');
    setChatHistory((prev) => [
      ...prev,
      { sender: 'user', text: userText, time: 'Now' },
    ]);

    // Simulated reply — the timer is tracked so it can be cancelled on unmount.
    replyTimerRef.current = setTimeout(() => {
      setChatHistory((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: 'Thanks for reaching out! A Victus support agent will be with you shortly. You can also view active tickets on the Support Hub.',
          time: 'Now',
        },
      ]);
    }, 800);
  };

  return (
    <>
      {/* Draggable Floating Chat Ball */}
      <button
        type="button"
        aria-label="Open support chat"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setIsDragging(false)}
        style={{
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          touchAction: 'none',
        }}
        className={`absolute top-0 left-0 z-overlay w-[54px] h-[54px] rounded-full bg-white text-slate-900 shadow-[0_8px_28px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.2)] flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform duration-75 select-none ${
          isDragging ? 'scale-105 opacity-90 shadow-2xl' : 'hover:scale-105'
        }`}
      >
        <div className="relative flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-violet-600 fill-violet-100" />
          {/* Subtle online pulse dot */}
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
        </div>
      </button>

      {/* Interactive Quick Support & Chat Sheet/Modal */}
      {isChatModalOpen && (
        <div
          className="absolute inset-0 z-modal flex items-end justify-center bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsChatModalOpen(false)}
        >
          <div
            className="w-full h-[80%] rounded-t-3xl border-t border-white/[0.08] bg-[#111117] text-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-white/[0.08] bg-[#14141c] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
                  <LifeBuoy className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-white">Victus Live Support</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Online
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">Average response time: &lt; 2 minutes</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setIsChatModalOpen(false);
                    onNavigateSupport();
                  }}
                  title="Open Support Hub"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer text-xs flex items-center gap-1"
                >
                  <span className="text-[11px] hidden sm:inline">Hub</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsChatModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0d0d12]">
              {chatHistory.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${item.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                      item.sender === 'user'
                        ? 'bg-violet-600 text-white rounded-br-xs'
                        : 'bg-[#181822] text-slate-200 border border-white/[0.08] rounded-bl-xs'
                    }`}
                  >
                    {item.text}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 px-1">{item.time}</span>
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            <div className="px-4 py-2 bg-[#12121a] border-t border-white/[0.06] flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => {
                  showToast('Connecting you to server billing department…');
                  setChatHistory((prev) => [
                    ...prev,
                    {
                      sender: 'bot',
                      text: 'Routing your chat to the Billing Team. One moment please.',
                      time: 'Now',
                    },
                  ]);
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors whitespace-nowrap cursor-pointer"
              >
                Billing Inquiry
              </button>
              <button
                onClick={() => {
                  showToast('Requesting node status details…');
                  setChatHistory((prev) => [
                    ...prev,
                    {
                      sender: 'bot',
                      text: 'Node SG-1 is currently operating at 99.98% uptime with zero packet loss.',
                      time: 'Now',
                    },
                  ]);
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors whitespace-nowrap cursor-pointer"
              >
                Node Status
              </button>
              <button
                onClick={() => {
                  setIsChatModalOpen(false);
                  onNavigateSupport();
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 transition-colors whitespace-nowrap cursor-pointer"
              >
                Open Ticket Hub
              </button>
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="p-3 bg-[#14141c] border-t border-white/[0.08] flex items-center gap-2">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Type a support message…"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#0e0e14] border border-white/[0.08] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
              />
              <button
                type="submit"
                disabled={!chatMessage.trim()}
                className="w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
