document.addEventListener("DOMContentLoaded", () => {
    const chatbotToggler = document.createElement("button");
    chatbotToggler.classList.add("chatbot-toggler");
    chatbotToggler.innerHTML = `
        <span class="material-symbols-rounded">mode_comment</span>
        <span class="material-symbols-outlined">close</span>
    `;

    const chatbot = document.createElement("div");
    chatbot.classList.add("chatbot");
    chatbot.innerHTML = `
        <header>
            <h2>Chatbot</h2>
            <span class="close-btn material-symbols-outlined">close</span>
        </header>
        <div class="chatbox">
            <iframe src="qa-interface.html" style="width: 100%; height: 100%; border: none;"></iframe>
        </div>
    `;

    document.body.appendChild(chatbotToggler);
    document.body.appendChild(chatbot);

    const closeBtn = document.querySelector(".close-btn");

    const toggleChatbot = () => {
        document.body.classList.toggle("show-chatbot");
    }

    chatbotToggler.addEventListener("click", toggleChatbot);
    closeBtn.addEventListener("click", toggleChatbot);

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
