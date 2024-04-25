(function () {
  const messages = document.querySelector("#messages");
  const wsStartButton = document.querySelector("#wsStartButton");
  const wsStopButton = document.querySelector("#wsStopButton");
  const wsSendButton = document.querySelector("#wsSendButton");
  const logout = document.querySelector("#logout");
  const session = document.querySelector("#session");
  const login = document.querySelector("#login");
  const rememberMe = document.querySelector("#rememberMe");

  function showMessage(message) {
    messages.textContent += `\n${message}`;
    messages.scrollTop = messages.scrollHeight;
  }

  async function handleResponse(response) {
    try {
      const data = await response.json();
      if (typeof data !== 'undefined' && data !== null) {
        return JSON.stringify(data);
      }
      else {
        return data;
      }
    } catch (error) {
      return error.message
    }
  }

  login.onclick = function () {
    fetch("/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "abc@example.com",
        password: "123456789",
        rememberMe: false,
      }),
    })
      .then(handleResponse)
      .then(showMessage)
      .catch(function (err) {
        showMessage(err.message);
      });
  };

  rememberMe.onclick = function () {
    fetch("/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "abc@example.com",
        password: "123456789",
        rememberMe: true,
      }),
    })
      .then(handleResponse)
      .then(showMessage)
      .catch(function (err) {
        showMessage(err.message);
      });
  };

  session.onclick = function () {
    fetch("/auth/session", {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
      .then(handleResponse)
      .then(showMessage)
      .catch(function (err) {
        showMessage(err.message);
      });
  };

  logout.onclick = function () {
    fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    })
      .then(handleResponse)
      .then(showMessage)
      .catch(function (err) {
        showMessage(err.message);
      });
  };

  let ws;

  wsStartButton.onclick = function () {
    if (ws) {
      ws.onerror = ws.onopen = ws.onclose = null;
      ws.close();
    }

    ws = new WebSocket(`ws://${location.host}`);
    ws.onerror = function () {
      showMessage("WebSocket error");
    };
    ws.onopen = function () {
      showMessage("WebSocket connection established");
    };
    ws.onmessage = function (event) {
      showMessage(event.data);
    };
    ws.onclose = function () {
      showMessage("WebSocket connection closed");
      ws = null;
    };
  };

  wsSendButton.onclick = function () {
    if (!ws) {
      showMessage("No WebSocket connection");
      return;
    }

    ws.send("Hello World!");
    showMessage('Sent "Hello World!"');
  };

  wsStopButton.onclick = function () {
    if (!ws) {
      showMessage("No WebSocket connection");
      return;
    }

    ws.close();
    showMessage("Closing WebSocket connection");
  };
})();
