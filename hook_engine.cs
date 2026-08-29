using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Threading;
using System.Collections.Generic;

namespace PromptCowboyHook
{
    class Program
    {
        [DllImport("user32.dll", SetLastError = true)]
        static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", SetLastError = true)]
        static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("user32.dll")]
        static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

        [DllImport("user32.dll")]
        static extern bool TranslateMessage([In] ref MSG lpMsg);

        [DllImport("user32.dll")]
        static extern IntPtr DispatchMessage([In] ref MSG lpMsg);

        [DllImport("user32.dll")]
        static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll", SetLastError = true)]
        static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

        const int WH_KEYBOARD_LL = 13;
        const int WM_KEYDOWN = 0x0100;
        const int WM_SYSKEYDOWN = 0x0104;

        const uint INPUT_KEYBOARD = 1;
        const uint KEYEVENTF_KEYUP = 0x0002;
        const ushort VK_BACK = 0x08;
        const ushort VK_CONTROL = 0x11;
        const ushort VK_SHIFT = 0x10;
        const ushort VK_SPACE = 0x20;
        const ushort VK_RETURN = 0x0D;
        const ushort VK_V = 0x56;

        [StructLayout(LayoutKind.Sequential)]
        struct MSG
        {
            public IntPtr hwnd;
            public uint message;
            public IntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public POINT pt;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct POINT
        {
            public int x;
            public int y;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct KBDLLHOOKSTRUCT
        {
            public uint vkCode;
            public uint scanCode;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct INPUT
        {
            public uint type;
            public InputUnion u;
        }

        [StructLayout(LayoutKind.Explicit)]
        struct InputUnion
        {
            [FieldOffset(0)]
            public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        static void SendKey(ushort vk, bool keyUp)
        {
            INPUT input = new INPUT();
            input.type = INPUT_KEYBOARD;
            input.u.ki.wVk = vk;
            input.u.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
            SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
        }

        static void PressKey(ushort vk)
        {
            SendKey(vk, false);
            Thread.Sleep(2);
            SendKey(vk, true);
        }

        static void EraseChars(int count)
        {
            for (int i = 0; i < count; i++)
            {
                PressKey(VK_BACK);
                Thread.Sleep(2);
            }
        }

        static void PasteClipboard()
        {
            Thread.Sleep(50);
            SendKey(VK_CONTROL, false);
            Thread.Sleep(5);
            PressKey(VK_V);
            Thread.Sleep(5);
            SendKey(VK_CONTROL, true);
        }

        static char GetCharFromVk(uint vk)
        {
            if (vk >= 0x30 && vk <= 0x39) return (char)vk;
            if (vk >= 0x41 && vk <= 0x5A)
            {
                bool isShift = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
                char c = (char)vk;
                return isShift ? c : char.ToLower(c);
            }
            if (vk == VK_SPACE) return ' ';
            if (vk == 0xBF || vk == 191) return '/';
            if (vk == 0xBD || vk == 189) return '-';
            if (vk == 0xBE || vk == 190) return '.';
            if (vk == 0xBC || vk == 188) return ',';
            if (vk == 0xBA || vk == 186) return ';';
            if (vk == 0xDE || vk == 222) return '\'';
            return '\0';
        }

        static List<char> buffer = new List<char>();
        static List<string> triggers = new List<string> { "/cowboy", "/cowboys", "/prompt", "/pc", "/improve" };
        static IntPtr hookHandle = IntPtr.Zero;
        static HookProc proc = HookCallback;

        static void StdinReader()
        {
            try
            {
                string line;
                while ((line = Console.ReadLine()) != null)
                {
                    line = line.Trim();
                    if (line.StartsWith("SET_TRIGGERS:"))
                    {
                        string raw = line.Substring("SET_TRIGGERS:".Length);
                        string[] parts = raw.Split(new char[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
                        List<string> newList = new List<string>();
                        foreach (string p in parts)
                        {
                            newList.Add(p.Trim().ToLower());
                        }
                        if (newList.Count > 0) triggers = newList;
                    }
                    else if (line.StartsWith("PASTE:"))
                    {
                        PasteClipboard();
                    }
                }
            }
            catch { }
        }

        static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN))
            {
                KBDLLHOOKSTRUCT kbd = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                uint vk = kbd.vkCode;

                if (vk == VK_BACK)
                {
                    if (buffer.Count > 0) buffer.RemoveAt(buffer.Count - 1);
                }
                else if (vk == VK_RETURN)
                {
                    buffer.Clear();
                }
                else
                {
                    char c = GetCharFromVk(vk);
                    if (c != '\0')
                    {
                        buffer.Add(c);
                        if (buffer.Count > 500) buffer.RemoveAt(0);

                        string text = new string(buffer.ToArray());
                        string textLower = text.ToLower();

                        string matchedTrigger = null;
                        foreach (string tr in triggers)
                        {
                            if (textLower.EndsWith(tr))
                            {
                                matchedTrigger = tr;
                                break;
                            }
                        }

                        if (matchedTrigger != null)
                        {
                            string roughPrompt = text.Substring(0, text.Length - matchedTrigger.Length).Trim();
                            if (roughPrompt.Length > 0)
                            {
                                int eraseCount = text.Length;
                                EraseChars(eraseCount);
                                buffer.Clear();

                                Console.WriteLine("PAYLOAD:" + roughPrompt);
                            }
                        }
                    }
                }
            }
            return CallNextHookEx(hookHandle, nCode, wParam, lParam);
        }

        static void Main(string[] args)
        {
            Thread t = new Thread(StdinReader);
            t.IsBackground = true;
            t.Start();

            using (System.Diagnostics.Process curProcess = System.Diagnostics.Process.GetCurrentProcess())
            using (System.Diagnostics.ProcessModule curModule = curProcess.MainModule)
            {
                hookHandle = SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
            }

            if (hookHandle == IntPtr.Zero)
            {
                Console.WriteLine("HOOK_FAILED");
                return;
            }

            Console.WriteLine("HOOK_READY");

            MSG msg;
            while (GetMessage(out msg, IntPtr.Zero, 0, 0) != 0)
            {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }

            UnhookWindowsHookEx(hookHandle);
        }
    }
}
