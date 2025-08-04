const chatbotCSS = `
/* Chatbot styles */
.chatbot-toggler {
    position: fixed;
    bottom: 30px;
    right: 35px;
    outline: none;
    border: none;
    height: 50px;
    width: 50px;
    display: flex;
    cursor: pointer;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #724ae8;
    transition: all 0.2s ease;
}

body.show-chatbot .chatbot-toggler {
    transform: rotate(90deg);
}

.chatbot-toggler span {
    color: #fff;
    position: absolute;
}

.chatbot-toggler span:last-child,
body.show-chatbot .chatbot-toggler span:first-child {
    opacity: 0;
}

body.show-chatbot .chatbot-toggler span:last-child {
    opacity: 1;
}

.chatbot {
    position: fixed;
    right: 35px;
    bottom: 90px;
    width: 420px;
    background: #fff;
    border-radius: 15px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
    transform: scale(0.5);
    transform-origin: bottom right;
    box-shadow: 0 0 128px 0 rgba(0, 0, 0, 0.1),
                0 32px 64px -48px rgba(0, 0, 0, 0.5);
    transition: all 0.1s ease;
}

body.show-chatbot .chatbot {
    opacity: 1;
    pointer-events: auto;
    transform: scale(1);
}

.chatbot .chatbox {
    overflow-y: hidden;
    height: 100%;
    padding: 0;
}

.chatbot :where(.chatbox, textarea)::-webkit-scrollbar {
    width: 6px;
}

.chatbot :where(.chatbox, textarea)::-webkit-scrollbar-track {
    background: #fff;
    border-radius: 25px;
}

.chatbot :where(.chatbox, textarea)::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 25px;
}

@media (max-width: 490px) {
    .chatbot-toggler {
        right: 20px;
        bottom: 20px;
    }

    .chatbot {
        right: 0;
        bottom: 0;
        height: 100%;
        border-radius: 0;
        width: 100%;
    }

    .chatbot .chatbox {
        height: 100%;
        padding: 0;
    }
}
`;

function addChatbotStyles() {
    const styleId = 'chatbot-styles';
    if (document.getElementById(styleId)) {
        return;
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = chatbotCSS;
    document.head.appendChild(style);
}

document.addEventListener("DOMContentLoaded", () => {
    addChatbotStyles();
    const chatbotToggler = document.createElement("button");
    chatbotToggler.classList.add("chatbot-toggler");
    chatbotToggler.innerHTML = `
        <span class="material-symbols-rounded">mode_comment</span>
        <span class="material-symbols-outlined">close</span>
    `;

    const chatbot = document.createElement("div");
    chatbot.classList.add("chatbot");
    chatbot.innerHTML = `
        <div class="chatbox">
            <iframe src="qa-interface.html" style="width: 100%; height: 100%; border: none;"></iframe>
        </div>
    `;

    document.body.appendChild(chatbotToggler);
    document.body.appendChild(chatbot);

    const toggleChatbot = () => {
        document.body.classList.toggle("show-chatbot");
    }

    chatbotToggler.addEventListener("click", toggleChatbot);

    // Add Google Icons link
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@48,400,0,0';
    document.head.appendChild(link);

    const link2 = document.createElement('link');
    link2.rel = 'stylesheet';
    link2.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@48,400,1,0';
    document.head.appendChild(link2);
});
