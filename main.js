const fs = require("fs");
const path = require("path");
const axios = require("axios");
const inquirer = require("inquirer").default;
const { logger } = require("./config/logger");
const displayBanner = require("./config/banner");
const { ColorTheme } = require("./config/colors");
const CountdownTimer = require("./config/countdown");
const { processData } = require("./config/user");

// Constants
const API_ENDPOINTS = {
  USER_INFO: "https://opapi.kiloex.io/tg/user/info",
  MINING_UPDATE: "https://opapi.kiloex.io/tg/mining/update",
  OPEN_ORDER: "https://opapi.kiloex.io/tg/order/open",
  PRODUCT_LIST: "https://opapi.kiloex.io/tg/product/list",
};

const TASK_ENDPOINTS = {
  TASK_LIST: "https://opapi.kiloex.io/noviceTask/tglist",
  TASK_REPORT: "https://opapi.kiloex.io/noviceTask/report",
  TASK_CLAIM: "https://opapi.kiloex.io/noviceTask/claim",
};

const TRADING_OPTIONS = {
  margin: [
    { name: "10 USDT", value: 10 },
    { name: "50 USDT", value: 50 },
    { name: "100 USDT", value: 100 },
  ],
  leverage: [
    { name: "50x", value: 50 },
    { name: "100x", value: 100 },
    { name: "150x", value: 150 },
  ],
  settleDelay: [
    { name: "30 seconds", value: 30 },
    { name: "1 minute", value: 60 },
    { name: "5 minutes", value: 300 },
    { name: "1 hour", value: 3600 },
  ],
};

// Initialize color theme
const colors = new ColorTheme();

class KiloexAPIClient {
  constructor() {
    this.initializeHeaders();
    this.initializeCountdownTimer();
    this.initializeTradingConfig();
  }

  // Helper function for number formatting
  formatNumber(value) {
    if (value >= 1000000000) {
      return (value / 1000000000).toFixed(2) + "B";
    }
    if (value >= 1000000) {
      return (value / 1000000).toFixed(2) + "M";
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(2) + "K";
    }
    return value.toFixed(2);
  }

  initializeHeaders() {
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US;q=0.6,en;q=0.5",
      Origin: "https://app.kiloex.io",
      Referer: "https://app.kiloex.io/",
      "Sec-Ch-Ua":
        '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": '"Android"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36",
    };
  }

  initializeCountdownTimer() {
    this.countdownTimer = new CountdownTimer({
      colors: {
        message: colors.colors.timerCount,
        timer: colors.colors.timerWarn,
        reset: colors.colors.reset,
      },
      format: "HH:mm:ss",
      message: "Time remaining: ",
    });
  }

  initializeTradingConfig() {
    this.tradingConfig = {
      margin: 10,
      leverage: 100,
      settleDelay: 300,
      productId: "default",
    };
    this.products = [];
  }

  async loadProducts() {
    try {
      const response = await axios.get(
        `${API_ENDPOINTS.PRODUCT_LIST}?tags=tgMiniApp&types=all`,
        { headers: this.headers }
      );

      if (response.data.status && response.data.data) {
        this.products = response.data.data.sort((a, b) => a.sort - b.sort);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(
        colors.style(`Error loading products: ${error.message}`, "error")
      );
      return false;
    }
  }

  getRandomProduct() {
    const index = Math.floor(Math.random() * this.products.length);
    return this.products[index];
  }

  async selectProduct() {
    const modeChoices = [
      {
        name: colors.style("Default (BTC)", "menuOption"),
        value: "default",
      },
      {
        name: colors.style("Random (Changes each order)", "menuOption"),
        value: "random",
      },
      {
        name: colors.style("Manual Selection", "menuOption"),
        value: "manual",
      },
    ];

    const { mode } = await inquirer.prompt([
      {
        type: "list",
        name: "mode",
        message: colors.style("Select product mode:", "menuTitle"),
        choices: modeChoices,
        pageSize: 10,
      },
    ]);

    if (mode === "manual") {
      const { productId } = await inquirer.prompt([
        {
          type: "list",
          name: "productId",
          message: colors.style("Select trading pair:", "menuTitle"),
          choices: this.products.map((p) => ({
            name: colors.style(`${p.base}`, "menuOption"),
            value: p.id,
          })),
          pageSize: 10,
          loop: false,
        },
      ]);
      return productId;
    }

    return mode;
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  formatSettleDelay(seconds) {
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${seconds / 60} minutes`;
    return `${seconds / 3600} hour`;
  }

  handleError(error, message) {
    if (error?.response?.data?.msg) {
      // Translate Chinese error message
      let errorMsg = error.response.data.msg;
      if (errorMsg.includes("余额不足")) {
        errorMsg = "Insufficient balance";
      }
      return colors.style(`${message}: ${errorMsg}`, "error");
    }
    return colors.style(`${message}: ${error.message}`, "error");
  }

  async makeRequest(method, url, data = null) {
    try {
      const config = { headers: this.headers };
      const response =
        method === "GET"
          ? await axios.get(url, config)
          : await axios.post(url, data, config);

      if (response.status === 200 && response.data.status === true) {
        return { success: true, data: response.data.data };
      }
      return { success: false, error: response.data.msg };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getTaskList(account) {
    try {
      const url = `${TASK_ENDPOINTS.TASK_LIST}?account=${account}`;
      const response = await axios.get(url, { headers: this.headers });

      if (response.status === 200 && response.data.status === true) {
        return {
          success: true,
          data: response.data.data.list,
          stats: {
            tradeVolume: response.data.data.tradeVolume,
            mining: response.data.data.mining,
            inviteNum: response.data.data.inviteNum,
          },
        };
      }
      return { success: false, error: response.data.msg };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async reportTask(account, taskId) {
    try {
      const response = await axios.post(
        TASK_ENDPOINTS.TASK_REPORT,
        { account, id: taskId },
        { headers: this.headers }
      );

      return (
        response.status === 200 &&
        response.data.status === true &&
        response.data.data.status === true
      );
    } catch (error) {
      return false;
    }
  }

  async claimTask(account, taskId) {
    try {
      const response = await axios.post(
        TASK_ENDPOINTS.TASK_CLAIM,
        { account, id: taskId },
        { headers: this.headers }
      );

      if (response.status === 200 && response.data.status === true) {
        const reward = response.data.data[0];
        logger.success(
          colors.style(`Claimed reward: ${reward.number} points`, "success")
        );
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  canClaimTask(task, stats) {
    if (task.unlockId !== null) {
      return false;
    }

    if (task.type === "speed_tg_channel") {
      return false;
    }

    if (task.type === "mining") {
      const requiredAmount = task.requirement[0].amount;
      return stats.mining >= requiredAmount;
    }

    if (task.type === "trade_coin") {
      const requiredAmount = task.requirement[0].amount;
      return stats.tradeVolume >= requiredAmount;
    }

    if (task.type === "referral") {
      const requiredAmount = task.requirement[0].amount;
      return stats.inviteNum >= requiredAmount;
    }

    return true;
  }

  getTaskTranslation(taskName) {
    const translations = {
      // Social Media Tasks
      "关注KiloEx X": "Follow KiloEx X",
      加入Discord: "Join Discord",
      加入Tg群组: "Join Telegram Group",
      "加入Tg Channel": "Join Telegram Channel",
      "加速Tg Channel": "Speed Up Telegram Channel",

      // Mining Tasks
      勤劳矿工1: "Diligent Miner 1",
      勤劳矿工2: "Diligent Miner 2",
      勤劳矿工3: "Diligent Miner 3",
      勤劳矿工4: "Diligent Miner 4",
      勤劳矿工5: "Diligent Miner 5",

      // Trading Tasks
      模拟交易达人1: "Trading Master 1",
      模拟交易达人2: "Trading Master 2",
      模拟交易达人3: "Trading Master 3",
      模拟交易达人4: "Trading Master 4",
      模拟交易达人5: "Trading Master 5",

      // Referral Tasks
      邀请有礼: "Invite Rewards",
    };

    return translations[taskName] || taskName;
  }

  async processTask(account, task, stats) {
    if (task.doneTime || task.receiveTime) {
      return;
    }

    if (
      task.type === "subscribe_tg_channel" ||
      task.type === "speed_tg_channel"
    ) {
      return;
    }

    const taskName = this.getTaskTranslation(task.name);

    if (task.unlockId !== null) {
      logger.info(colors.style(`Task locked: ${taskName}`, "info"));
      return;
    }

    logger.info(colors.style(`Processing task: ${taskName}`, "info"));

    if (!this.canClaimTask(task, stats)) {
      if (task.type === "mining") {
        logger.info(
          colors.style(
            `Mining progress: ${this.formatNumber(
              stats.mining
            )}/${this.formatNumber(task.requirement[0].amount)}`,
            "info"
          )
        );
      } else if (task.type === "trade_coin") {
        logger.info(
          colors.style(
            `Trading progress: ${this.formatNumber(
              stats.tradeVolume
            )}/${this.formatNumber(task.requirement[0].amount)}`,
            "info"
          )
        );
      } else if (task.type === "referral") {
        logger.info(
          colors.style(
            `Referral progress: ${stats.inviteNum}/${task.requirement[0].amount}`,
            "info"
          )
        );
      }
      return;
    }

    const isReported = await this.reportTask(account, task.id);
    if (isReported) {
      logger.success(colors.style(`Task reported: ${taskName}`, "success"));
      await this.sleep(2000);
      const isClaimed = await this.claimTask(account, task.id);
      if (isClaimed) {
        logger.success(
          colors.style(`Reward claimed for: ${taskName}`, "success")
        );
      } else {
        logger.error(
          colors.style(`Failed to claim reward: ${taskName}`, "error")
        );
      }
    }
  }

  async processAllTasks(account, name) {
    try {
      logger.info(colors.style(`Processing tasks for ${name}`, "menuTitle"));

      const taskList = await this.getTaskList(account);
      if (!taskList.success) {
        logger.error(
          colors.style(`Failed to get task list: ${taskList.error}`, "error")
        );
        return;
      }

      // Display task statistics
      logger.info(colors.style("Task Statistics:", "menuTitle"));
      logger.info(
        colors.style(
          `Trade Volume : ${this.formatNumber(taskList.stats.tradeVolume)}`,
          "value"
        )
      );
      logger.info(
        colors.style(
          `Mining      : ${this.formatNumber(taskList.stats.mining)}`,
          "value"
        )
      );
      logger.info(
        colors.style(`Invites     : ${taskList.stats.inviteNum}`, "value")
      );
      logger.info(colors.style("===============================", "border"));

      // Group tasks and check requirements
      const miningTasks = taskList.data.filter((t) => t.type === "mining");
      const tradeTasks = taskList.data.filter((t) => t.type === "trade_coin");
      const inviteTasks = taskList.data.filter((t) => t.type === "referral");

      let requirementsNotMet = false;

      // Check mining tasks
      if (miningTasks.length > 0) {
        const minMiningReq = Math.min(
          ...miningTasks.map((t) => t.requirement[0].amount)
        );
        if (taskList.stats.mining < minMiningReq) {
          logger.info(
            colors.style(
              `Does not meet the minimum requirement for mining task: ${this.formatNumber(
                taskList.stats.mining
              )}/${this.formatNumber(minMiningReq)}`,
              "info"
            )
          );
          requirementsNotMet = true;
        }
      }

      // Check trading tasks
      if (tradeTasks.length > 0) {
        const minTradeReq = Math.min(
          ...tradeTasks.map((t) => t.requirement[0].amount)
        );
        if (taskList.stats.tradeVolume < minTradeReq) {
          logger.info(
            colors.style(
              `Does not meet the minimum requirement for trading task: ${this.formatNumber(
                taskList.stats.tradeVolume
              )}/${this.formatNumber(minTradeReq)}`,
              "info"
            )
          );
          requirementsNotMet = true;
        }
      }

      // Check invite tasks
      if (inviteTasks.length > 0) {
        const minInviteReq = Math.min(
          ...inviteTasks.map((t) => t.requirement[0].amount)
        );
        if (taskList.stats.inviteNum < minInviteReq) {
          logger.info(
            colors.style(
              `Does not meet the minimum requirement for invite task: ${taskList.stats.inviteNum}/${minInviteReq}`,
              "info"
            )
          );
          requirementsNotMet = true;
        }
      }

      // Only process tasks if requirements are met
      if (!requirementsNotMet) {
        for (const task of taskList.data) {
          await this.processTask(account, task, taskList.stats);
          await this.sleep(2000);
        }
      }
    } catch (error) {
      logger.error(
        colors.style(`Error processing tasks: ${error.message}`, "error")
      );
    }
  }

  async configureTradingSettings() {
    const productsLoaded = await this.loadProducts();
    if (!productsLoaded) {
      logger.error(
        colors.style(
          "Failed to load products. Using default settings.",
          "error"
        )
      );
      this.tradingConfig = {
        productId: "default",
        margin: 10,
        leverage: 100,
        settleDelay: 300,
      };
      return;
    }

    const productId = await this.selectProduct();
    const tradingPrompts = [
      {
        type: "list",
        name: "margin",
        message: colors.style("Select margin amount:", "menuTitle"),
        choices: TRADING_OPTIONS.margin.map((opt) => ({
          name: colors.style(opt.name, "menuOption"),
          value: opt.value,
        })),
      },
      {
        type: "list",
        name: "leverage",
        message: colors.style("Select leverage:", "menuTitle"),
        choices: TRADING_OPTIONS.leverage.map((opt) => ({
          name: colors.style(opt.name, "menuOption"),
          value: opt.value,
        })),
      },
      {
        type: "list",
        name: "settleDelay",
        message: colors.style("Select settle delay:", "menuTitle"),
        choices: TRADING_OPTIONS.settleDelay.map((opt) => ({
          name: colors.style(opt.name, "menuOption"),
          value: opt.value,
        })),
      },
    ];

    const config = await inquirer.prompt(tradingPrompts);
    this.tradingConfig = {
      ...config,
      productId,
    };

    this.displayTradingConfig();
  }

  displayTradingConfig() {
    logger.info(colors.style("Selected Trading Configuration:", "menuTitle"));

    const productMode = this.tradingConfig.productId;
    if (productMode === "default") {
      logger.info(colors.style(`Product     : BTC (Default)`, "value"));
    } else if (productMode === "random") {
      logger.info(
        colors.style(`Product     : Random (changes each order)`, "value")
      );
    } else {
      const product = this.products.find((p) => p.id === productMode);
      if (product) {
        logger.info(
          colors.style(
            `Product     : ${product.base} (${product.name})`,
            "value"
          )
        );
      }
    }

    logger.info(
      colors.style(
        `Margin      : ${this.formatNumber(this.tradingConfig.margin)} USDT`,
        "value"
      )
    );
    logger.info(
      colors.style(`Leverage    : ${this.tradingConfig.leverage}x`, "value")
    );
    logger.info(
      colors.style(
        `Settle Delay: ${this.formatSettleDelay(
          this.tradingConfig.settleDelay
        )}`,
        "value"
      )
    );
    logger.info(colors.style("===============================", "border"));
  }

  async getUserInfo(account, name) {
    const url = `${API_ENDPOINTS.USER_INFO}?account=${account}&name=${name}&from=kiloextrade`;
    return await this.makeRequest("GET", url);
  }

  async checkAndBindReferral(account) {
    try {
      const checkResponse = await axios.get(
        `https://opapi.kiloex.io/tg/referral/code?account=${account}`,
        { headers: this.headers }
      );

      if (checkResponse.status === 200 && checkResponse.data.status === true) {
        if (!checkResponse.data.data.length) {
          await this.sleep(2000);
          await axios.post(
            "https://opapi.kiloex.io/tg/referral/bind",
            {
              account: account,
              code: "n3m72b1h",
            },
            { headers: this.headers }
          );
        }
        return { success: true };
      } else {
        return { success: false, error: checkResponse.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateMining(account, stamina) {
    const result = await this.makeRequest("POST", API_ENDPOINTS.MINING_UPDATE, {
      account: account,
      stamina: stamina,
      coin: stamina,
    });

    if (result.success) {
      logger.success(colors.style("Mining successful", "success"));
    }
    return result;
  }

  async openOrder(account, positionType) {
    try {
      let productId;
      let productInfo;

      switch (this.tradingConfig.productId) {
        case "default":
          productId = 2;
          productInfo = { base: "BTC", name: "BTCUSD" };
          break;

        case "random":
          productInfo = this.getRandomProduct();
          productId = productInfo.id;
          logger.info(
            colors.style(
              `Selected random product: ${productInfo.base} (${productInfo.name})`,
              "info"
            )
          );
          break;

        default:
          productId = this.tradingConfig.productId;
          productInfo = this.products.find((p) => p.id === productId);
      }

      await this.sleep(5000);

      const result = await this.makeRequest("POST", API_ENDPOINTS.OPEN_ORDER, {
        account: account,
        productId: parseInt(productId),
        margin: this.tradingConfig.margin,
        leverage: this.tradingConfig.leverage,
        positionType: positionType,
        settleDelay: this.tradingConfig.settleDelay,
      });

      if (!result.success) {
        const errorMsg = result.error;
        if (errorMsg?.includes("余额不足")) {
          logger.error(
            colors.style(
              `Error opening ${positionType} position: Insufficient balance. Required: ${this.formatNumber(
                this.tradingConfig.margin
              )} USDT`,
              "txFailed"
            )
          );
          return { success: false, error: "INSUFFICIENT_BALANCE" };
        }

        if (errorMsg?.includes("too quickly")) {
          logger.info(
            colors.style("Rate limit hit. Waiting 5 seconds...", "info")
          );
          await this.sleep(5000);
          return await this.openOrder(account, positionType);
        }

        return result;
      }

      if (result.success) {
        this.displayOrderInfo(result.data, positionType, productInfo);
      }
      return result;
    } catch (error) {
      logger.error(
        colors.style(`Error in openOrder: ${error.message}`, "error")
      );
      return { success: false, error: error.message };
    }
  }

  displayOrderInfo(orderData, positionType, productInfo) {
    const closeTime = orderData.closeTime
      ? new Date(orderData.closeTime).toLocaleString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      : "Not set";

    logger.success(
      colors.style(`Successfully opened ${positionType} position:`, "txSuccess")
    );
    if (productInfo) {
      logger.info(
        colors.style(
          `Product   : ${productInfo.base} (${productInfo.name})`,
          "value"
        )
      );
    }
    logger.info(colors.style(`Leverage  : ${orderData.leverage}x`, "value"));
    logger.info(
      colors.style(
        `Margin    : ${this.formatNumber(orderData.margin)} USDT`,
        "value"
      )
    );
    logger.info(colors.style(`Close Time: ${closeTime}`, "value"));
  }

  displayUserInfo(userData) {
    logger.info(colors.style(`ID      : ${userData.id}`, "value"));
    logger.info(colors.style(`Level   : ${userData.level}`, "value"));
    logger.info(
      colors.style(
        `Balance : ${this.formatNumber(userData.balance)} USDT`,
        "value"
      )
    );
    logger.info(colors.style(`Stamina : ${userData.stamina}`, "value"));
    logger.info(
      colors.style(`EXP     : ${this.formatNumber(userData.exp)}`, "value")
    );
  }

  async processAccount(account, name, index) {
    try {
      logger.info(
        colors.style(`Processing Account ${index + 1} | ${name}`, "menuBorder")
      );

      // Get user info first
      const userInfo = await this.getUserInfo(account, name);
      if (!userInfo.success) {
        logger.error(
          colors.style(
            `Unable to get account information: ${userInfo.error}`,
            "accountError"
          )
        );
        return;
      }

      this.displayUserInfo(userInfo.data);

      // Check balance availability first
      const requiredBalance = this.tradingConfig.margin * 2;
      if (userInfo.data.balance < requiredBalance) {
        logger.info(
          colors.style(
            `Insufficient balance (${this.formatNumber(
              userInfo.data.balance
            )} USDT) for trading. Required: ${this.formatNumber(
              requiredBalance
            )} USDT`,
            "info"
          )
        );
        return;
      }

      // Process tasks
      await this.sleep(3000);
      await this.processAllTasks(account, name);

      // Process mining
      if (userInfo.data.stamina > 0) {
        await this.sleep(5000);
        await this.updateMining(account, userInfo.data.stamina);
      }

      // Process referral in background
      await this.sleep(2000);
      await this.checkAndBindReferral(account);

      // Add longer delay before trading
      await this.sleep(5000);

      // Start trading
      logger.info(
        colors.style(
          `Starting trading with balance: ${this.formatNumber(
            userInfo.data.balance
          )} USDT`,
          "info"
        )
      );

      // Process long position
      const longResult = await this.openOrder(account, "long");
      await this.sleep(5000);

      // Only proceed with short if we didn't get a permanent error
      if (longResult.success || longResult.error === "INSUFFICIENT_BALANCE") {
        const shortResult = await this.openOrder(account, "short");

        if (longResult.success && shortResult.success) {
          logger.success(
            colors.style("Successfully opened both positions", "txSuccess")
          );
        }
      }
    } catch (error) {
      logger.error(
        colors.style(
          `Error processing account ${account}: ${error.message}`,
          "accountError"
        )
      );
    }
  }

  async startTradingCycle() {
    const accounts = await this.loadAccountData();
    const bufferTime = 10;

    while (true) {
      for (let i = 0; i < accounts.length; i++) {
        const [account, name] = accounts[i].split("|");
        if (!account || !name) {
          logger.error(
            colors.style(`Invalid data line: ${accounts[i]}`, "error")
          );
          continue;
        }

        await this.processAccount(account.trim(), name.trim(), i);

        if (i < accounts.length - 1) {
          await this.sleep(3000);
        }
      }

      const waitTime = this.tradingConfig.settleDelay + bufferTime;
      logger.success(
        colors.style(
          `Cycle completed, waiting for ${this.formatSettleDelay(waitTime)}...`,
          "complete"
        )
      );
      await this.countdown(waitTime);
    }
  }

  async loadAccountData() {
    const dataFile = path.join(__dirname, "data.txt");
    if (!fs.existsSync(dataFile)) {
      throw new Error("data.txt file not found");
    }

    const data = fs
      .readFileSync(dataFile, "utf8")
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.trim())
      .filter((line) => line.includes("|"));

    if (data.length === 0) {
      throw new Error("No account data found in data.txt");
    }

    return data;
  }

  async selectOperationMode() {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: colors.style("Select an action:", "menuTitle"),
        choices: [
          { name: colors.style("Run Bot", "menuOption"), value: "bot" },
          {
            name: colors.style("Get Data by Query", "menuOption"),
            value: "query",
          },
        ],
      },
    ]);
    return action;
  }

  async handleQueryMode() {
    const queryAnswer = await inquirer.prompt([
      {
        type: "input",
        name: "inputFile",
        message: colors.style("Enter input file name:", "menuTitle"),
        default: "query.txt",
      },
      {
        type: "input",
        name: "outputFile",
        message: colors.style("Enter output file name:", "menuTitle"),
        default: "data.txt",
      },
    ]);
    await processData(queryAnswer.inputFile, queryAnswer.outputFile);
  }

  async countdown(seconds) {
    try {
      await this.countdownTimer.start(seconds, {
        format: "HH:mm:ss",
        message: colors.style("Time remaining: ", "timerCount"),
        clearOnComplete: true,
      });
    } catch (error) {
      logger.error(colors.style(`Countdown error: ${error.message}`, "error"));
    }
  }

  async main() {
    try {
      displayBanner();

      const mode = await this.selectOperationMode();
      if (mode === "query") {
        await this.handleQueryMode();
        return;
      }

      await this.configureTradingSettings();
      await this.startTradingCycle();
    } catch (error) {
      logger.error(this.handleError(error, "Program error"));
      throw error;
    }
  }
}

// Initialize and run the client
const client = new KiloexAPIClient();
client.main().catch((err) => {
  logger.error(colors.style(err.message, "error"));
  process.exit(1);
});
