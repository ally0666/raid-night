local PREFIX = "RaidNight"
local ROW_COUNT = 12

local db
local frame
local searchBox
local itemButtons = {}
local pickButtons = {}
local rosterLines = {}
local filtered = {}
local roster = {}
local bossFilter = "ALL"
local scrollOffset = 0
local playerClass

local CLASS_COLOR = {
  WARRIOR = { 0.78, 0.61, 0.43 },
  PALADIN = { 0.96, 0.55, 0.73 },
  HUNTER = { 0.67, 0.83, 0.45 },
  ROGUE = { 1.00, 0.96, 0.41 },
  PRIEST = { 1.00, 1.00, 1.00 },
  SHAMAN = { 0.00, 0.44, 0.87 },
  MAGE = { 0.25, 0.78, 0.92 },
  WARLOCK = { 0.53, 0.53, 0.82 },
  DRUID = { 1.00, 0.49, 0.04 },
}

local function Print(msg)
  DEFAULT_CHAT_FRAME:AddMessage("|cffe2b657Raid Night:|r " .. tostring(msg))
end

local function PlayerName()
  local name = UnitName("player")
  return name and strlower(name) or ""
end

local function ClassFile()
  local _, class = UnitClass("player")
  return class or "WARRIOR"
end

local function InRaidOrParty()
  if IsInRaid and IsInRaid() then return true end
  if IsInGroup and IsInGroup() then return true end
  if GetNumRaidMembers and GetNumRaidMembers() > 0 then return true end
  if GetNumPartyMembers and GetNumPartyMembers() > 0 then return true end
  return false
end

local function CommChannel()
  if IsInRaid and IsInRaid() then return "RAID" end
  if GetNumRaidMembers and GetNumRaidMembers() > 0 then return "RAID" end
  if IsInGroup and IsInGroup() then return "PARTY" end
  if GetNumPartyMembers and GetNumPartyMembers() > 0 then return "PARTY" end
  return nil
end

local function IsLead()
  if UnitIsGroupLeader and UnitIsGroupLeader("player") then return true end
  if IsRaidLeader and IsRaidLeader() then return true end
  if IsPartyLeader and IsPartyLeader() then return true end
  return false
end

local function Send(payload)
  local channel = CommChannel()
  if not channel then return end
  if C_ChatInfo and C_ChatInfo.SendAddonMessage then
    C_ChatInfo.SendAddonMessage(PREFIX, payload, channel)
  elseif SendAddonMessage then
    SendAddonMessage(PREFIX, payload, channel)
  end
end

local function InstanceName(id)
  for _, row in ipairs(RaidNightData.instances) do
    if row.id == id then return row.name end
  end
  return id
end

local function ItemById(id)
  for _, item in ipairs(RaidNightData.items) do
    if item.id == id then return item end
  end
end

local function Picks()
  db.picks[db.instanceId] = db.picks[db.instanceId] or {}
  return db.picks[db.instanceId]
end

local function HasClass(item, classFile)
  if not item.classes or item.classes == "" then return true end
  return strfind("," .. item.classes .. ",", "," .. classFile .. ",", 1, true) and true or false
end

local function Usable(item)
  if db.showAll then return true end
  return HasClass(item, playerClass)
end

local function RebuildFilter()
  wipe(filtered)
  local q = ""
  if searchBox then q = strlower(strtrim(searchBox:GetText() or "")) end
  for _, item in ipairs(RaidNightData.items) do
    if item.raid == db.instanceId and Usable(item) then
      if bossFilter == "ALL" or item.boss == bossFilter then
        if q == "" or strfind(strlower(item.name .. " " .. item.slot .. " " .. item.boss), q, 1, true) then
          tinsert(filtered, item)
        end
      end
    end
  end
end

local function Bosses()
  local list, seen = {}, {}
  for _, item in ipairs(RaidNightData.items) do
    if item.raid == db.instanceId and not seen[item.boss] then
      seen[item.boss] = true
      tinsert(list, item.boss)
    end
  end
  return list
end

local function IconTexture(item)
  local tex = GetItemIcon and GetItemIcon(item.id)
  if tex then return tex end
  return "Interface\\Icons\\" .. item.icon
end

local function Broadcast()
  local picks = Picks()
  local ids = table.concat(picks, ",")
  Send("P:" .. playerClass .. ":" .. ids)
  if IsLead() then
    Send("R:" .. db.instanceId .. ":" .. tostring(db.pickLimit))
  end
end

local function SetRoster(name, class, picks)
  roster[strlower(name)] = { name = name, class = class, picks = picks }
end

function RaidNight_Refresh()
  if not frame then return end
  RebuildFilter()
  local picks = Picks()
  for i = 1, 4 do
    local btn = pickButtons[i]
    if i > db.pickLimit then
      btn:Hide()
    else
      btn:Show()
      local id = picks[i]
      local item = id and ItemById(id)
      if item then
        btn.icon:SetTexture(IconTexture(item))
        btn.text:SetText(item.name)
        btn.itemId = id
      else
        btn.icon:SetTexture("Interface\\Icons\\INV_Misc_QuestionMark")
        btn.text:SetText(i .. " of " .. db.pickLimit)
        btn.itemId = nil
      end
    end
  end

  local maxOffset = math.max(0, #filtered - ROW_COUNT)
  if scrollOffset > maxOffset then scrollOffset = maxOffset end
  FauxScrollFrame_Update(frame.scroll, #filtered, ROW_COUNT, 28)
  for i = 1, ROW_COUNT do
    local btn = itemButtons[i]
    local item = filtered[i + scrollOffset]
    if item then
      btn:Show()
      btn.item = item
      btn.icon:SetTexture(IconTexture(item))
      btn.name:SetText(item.name)
      btn.meta:SetText(item.slot .. " · " .. item.boss)
      local selected = false
      for _, id in ipairs(picks) do
        if id == item.id then selected = true end
      end
      if selected then
        btn:SetBackdropColor(0.35, 0.22, 0.55, 0.9)
      elseif not HasClass(item, playerClass) then
        btn:SetBackdropColor(0.08, 0.08, 0.1, 0.7)
      else
        btn:SetBackdropColor(0.08, 0.11, 0.16, 0.9)
      end
    else
      btn:Hide()
      btn.item = nil
    end
  end

  local names = {}
  for name in pairs(roster) do tinsert(names, name) end
  table.sort(names)
  for i = 1, 8 do
    local line = rosterLines[i]
    local row = roster[names[i]]
    if row then
      line:Show()
      local c = CLASS_COLOR[row.class] or { 0.8, 0.8, 0.8 }
      line:SetTextColor(c[1], c[2], c[3])
      local labels = {}
      for _, id in ipairs(row.picks) do
        local item = ItemById(id)
        tinsert(labels, item and item.name or tostring(id))
      end
      local suffix = #labels > 0 and (" — " .. table.concat(labels, ", ")) or " — no picks"
      line:SetText(row.name .. suffix)
    else
      line:Hide()
    end
  end

  frame.subtitle:SetText(InstanceName(db.instanceId) .. " · " .. db.pickLimit .. " reserves")
end

local function TogglePick(item)
  if not item then return end
  local picks = Picks()
  for i, id in ipairs(picks) do
    if id == item.id then
      tremove(picks, i)
      Broadcast()
      RaidNight_Refresh()
      return
    end
  end
  if #picks >= db.pickLimit then
    Print("You already have " .. db.pickLimit .. " picks. Click one to drop it.")
    return
  end
  tinsert(picks, item.id)
  Broadcast()
  RaidNight_Refresh()
end

local function MakeBackdrop(f)
  if f.SetBackdrop then
    f:SetBackdrop({
      bgFile = "Interface\\Buttons\\WHITE8X8",
      edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
      tile = true,
      tileSize = 8,
      edgeSize = 12,
      insets = { left = 3, right = 3, top = 3, bottom = 3 },
    })
  end
end

local function BuildUI()
  if frame then return end
  local template = BackdropTemplateMixin and "BackdropTemplate" or nil
  frame = CreateFrame("Frame", "RaidNightFrame", UIParent, template)
  frame:SetSize(560, 620)
  frame:SetPoint("CENTER")
  MakeBackdrop(frame)
  frame:SetBackdropColor(0.04, 0.06, 0.09, 0.96)
  frame:SetBackdropBorderColor(0.89, 0.71, 0.34, 0.8)
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:RegisterForDrag("LeftButton")
  frame:SetScript("OnDragStart", frame.StartMoving)
  frame:SetScript("OnDragStop", frame.StopMovingOrSizing)
  frame:SetFrameStrata("DIALOG")
  frame:Hide()
  tinsert(UISpecialFrames, "RaidNightFrame")

  local title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", 16, -14)
  title:SetText("Raid Night")
  title:SetTextColor(0.89, 0.71, 0.34)

  frame.subtitle = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  frame.subtitle:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -4)

  local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", 2, 2)

  local instLabel = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  instLabel:SetPoint("TOPLEFT", 16, -52)
  instLabel:SetText("Instance")

  local inst = CreateFrame("Frame", "RaidNightInstanceDrop", frame, "UIDropDownMenuTemplate")
  inst:SetPoint("TOPLEFT", 0, -64)
  UIDropDownMenu_SetWidth(inst, 180)
  UIDropDownMenu_Initialize(inst, function()
    for _, row in ipairs(RaidNightData.instances) do
      local info = UIDropDownMenu_CreateInfo()
      info.text = row.name
      info.checked = db.instanceId == row.id
      info.func = function()
        db.instanceId = row.id
        bossFilter = "ALL"
        scrollOffset = 0
        UIDropDownMenu_SetText(inst, row.name)
        if IsLead() then Broadcast() end
        RaidNight_Refresh()
      end
      UIDropDownMenu_AddButton(info)
    end
  end)
  UIDropDownMenu_SetText(inst, InstanceName(db.instanceId))

  local bossDrop = CreateFrame("Frame", "RaidNightBossDrop", frame, "UIDropDownMenuTemplate")
  bossDrop:SetPoint("LEFT", inst, "RIGHT", -10, 0)
  UIDropDownMenu_SetWidth(bossDrop, 140)
  UIDropDownMenu_Initialize(bossDrop, function()
    local info = UIDropDownMenu_CreateInfo()
    info.text = "All bosses"
    info.checked = bossFilter == "ALL"
    info.func = function()
      bossFilter = "ALL"
      UIDropDownMenu_SetText(bossDrop, "All bosses")
      RaidNight_Refresh()
    end
    UIDropDownMenu_AddButton(info)
    for _, boss in ipairs(Bosses()) do
      info = UIDropDownMenu_CreateInfo()
      info.text = boss
      info.checked = bossFilter == boss
      info.func = function()
        bossFilter = boss
        UIDropDownMenu_SetText(bossDrop, boss)
        RaidNight_Refresh()
      end
      UIDropDownMenu_AddButton(info)
    end
  end)
  UIDropDownMenu_SetText(bossDrop, "All bosses")

  for i = 1, 4 do
    local btn = CreateFrame("Button", nil, frame, template)
    btn:SetSize(258, 36)
    if i == 1 then
      btn:SetPoint("TOPLEFT", 16, -108)
    elseif i == 2 then
      btn:SetPoint("TOPLEFT", 286, -108)
    elseif i == 3 then
      btn:SetPoint("TOPLEFT", 16, -148)
    else
      btn:SetPoint("TOPLEFT", 286, -148)
    end
    MakeBackdrop(btn)
    btn:SetBackdropColor(0.05, 0.05, 0.07, 0.9)
    btn.icon = btn:CreateTexture(nil, "ARTWORK")
    btn.icon:SetSize(28, 28)
    btn.icon:SetPoint("LEFT", 4, 0)
    btn.text = btn:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    btn.text:SetPoint("LEFT", btn.icon, "RIGHT", 6, 0)
    btn.text:SetPoint("RIGHT", -6, 0)
    btn.text:SetJustifyH("LEFT")
    btn:SetScript("OnClick", function(self)
      if self.itemId then
        local item = ItemById(self.itemId)
        if item then TogglePick(item) end
      end
    end)
    pickButtons[i] = btn
  end

  searchBox = CreateFrame("EditBox", "RaidNightSearch", frame, "InputBoxTemplate")
  searchBox:SetSize(320, 20)
  searchBox:SetPoint("TOPLEFT", 24, -196)
  searchBox:SetAutoFocus(false)
  searchBox:SetScript("OnTextChanged", function()
    scrollOffset = 0
    RaidNight_Refresh()
  end)

  local showAll = CreateFrame("CheckButton", "RaidNightShowAll", frame, "UICheckButtonTemplate")
  showAll:SetPoint("LEFT", searchBox, "RIGHT", 12, 0)
  showAll.text = showAll:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  showAll.text:SetPoint("LEFT", showAll, "RIGHT", 0, 0)
  showAll.text:SetText("Show all")
  showAll:SetChecked(db.showAll)
  showAll:SetScript("OnClick", function(self)
    db.showAll = self:GetChecked() and true or false
    RaidNight_Refresh()
  end)

  local scroll = CreateFrame("ScrollFrame", "RaidNightScroll", frame, "FauxScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 12, -228)
  scroll:SetPoint("BOTTOMRIGHT", -32, 150)
  frame.scroll = scroll
  scroll:SetScript("OnVerticalScroll", function(self, offset)
    FauxScrollFrame_OnVerticalScroll(self, offset, 28, function()
      scrollOffset = FauxScrollFrame_GetOffset(self)
      RaidNight_Refresh()
    end)
  end)

  for i = 1, ROW_COUNT do
    local btn = CreateFrame("Button", nil, frame, template)
    btn:SetSize(500, 26)
    btn:SetPoint("TOPLEFT", scroll, "TOPLEFT", 4, -2 - (i - 1) * 28)
    MakeBackdrop(btn)
    btn.icon = btn:CreateTexture(nil, "ARTWORK")
    btn.icon:SetSize(22, 22)
    btn.icon:SetPoint("LEFT", 4, 0)
    btn.name = btn:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    btn.name:SetPoint("LEFT", btn.icon, "RIGHT", 6, 4)
    btn.name:SetPoint("RIGHT", -8, 4)
    btn.name:SetJustifyH("LEFT")
    btn.meta = btn:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    btn.meta:SetPoint("TOPLEFT", btn.name, "BOTTOMLEFT", 0, -1)
    btn:SetScript("OnClick", function(self)
      if self.item then TogglePick(self.item) end
    end)
    btn:SetScript("OnEnter", function(self)
      if not self.item then return end
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      GameTooltip:SetHyperlink("item:" .. self.item.id)
      GameTooltip:Show()
    end)
    btn:SetScript("OnLeave", function() GameTooltip:Hide() end)
    itemButtons[i] = btn
  end

  local rosterTitle = frame:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  rosterTitle:SetPoint("BOTTOMLEFT", 16, 128)
  rosterTitle:SetText("Raid picks")

  for i = 1, 8 do
    local line = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    line:SetPoint("TOPLEFT", rosterTitle, "BOTTOMLEFT", 0, -4 - (i - 1) * 12)
    line:SetPoint("RIGHT", -16, 0)
    line:SetJustifyH("LEFT")
    rosterLines[i] = line
  end

  local export = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
  export:SetSize(140, 24)
  export:SetPoint("BOTTOMLEFT", 16, 16)
  export:SetText("Gargul CSV")
  export:SetScript("OnClick", function()
    RaidNight_ShowExport()
  end)

  local hint = frame:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  hint:SetPoint("BOTTOMLEFT", 164, 20)
  hint:SetText("/rn  ·  lead sets the instance  ·  picks share in raid")
end

function RaidNight_ShowExport()
  local names = {}
  SetRoster(UnitName("player"), playerClass, Picks())
  for name in pairs(roster) do tinsert(names, name) end
  table.sort(names)
  local lines = { "ItemId,Name,Class,Note,Plus" }
  for _, key in ipairs(names) do
    local row = roster[key]
    for _, id in ipairs(row.picks) do
      tinsert(lines, string.format("%d,%s,%s,,0", id, strlower(row.name), strlower(row.class)))
    end
  end
  local text = table.concat(lines, "\n")
  if not frame.exportBox then
    local template = BackdropTemplateMixin and "BackdropTemplate" or nil
    local box = CreateFrame("Frame", "RaidNightExport", frame, template)
    box:SetSize(420, 180)
    box:SetPoint("CENTER")
    MakeBackdrop(box)
    box:SetBackdropColor(0, 0, 0, 0.95)
    box:SetFrameStrata("FULLSCREEN_DIALOG")
    local eb = CreateFrame("EditBox", nil, box)
    eb:SetMultiLine(true)
    eb:SetFontObject(GameFontHighlightSmall)
    eb:SetPoint("TOPLEFT", 10, -10)
    eb:SetPoint("BOTTOMRIGHT", -10, 36)
    eb:SetAutoFocus(true)
    box.edit = eb
    local close = CreateFrame("Button", nil, box, "UIPanelButtonTemplate")
    close:SetSize(80, 22)
    close:SetPoint("BOTTOM", 0, 8)
    close:SetText("Close")
    close:SetScript("OnClick", function() box:Hide() end)
    frame.exportBox = box
  end
  frame.exportBox.edit:SetText(text)
  frame.exportBox.edit:HighlightText()
  frame.exportBox:Show()
  Print("Select the text and Ctrl+C, then /gl sr in Gargul.")
end

function RaidNight_Toggle()
  BuildUI()
  if frame:IsShown() then
    frame:Hide()
  else
    frame:Show()
    RaidNight_Refresh()
  end
end

local function OnAddonMessage(prefix, message, _, sender)
  if prefix ~= PREFIX then return end
  if not sender or strlower(sender) == PlayerName() then return end
  local kind, a, b = strsplit(":", message, 3)
  if kind == "P" then
    local picks = {}
    if b and b ~= "" then
      for id in string.gmatch(b, "%d+") do tinsert(picks, tonumber(id)) end
    end
    SetRoster(sender, a or "WARRIOR", picks)
    if frame and frame:IsShown() then RaidNight_Refresh() end
  elseif kind == "R" and a then
    db.instanceId = a
    db.pickLimit = math.max(1, math.min(10, tonumber(b) or db.pickLimit))
    if frame and frame:IsShown() then RaidNight_Refresh() end
  elseif kind == "Q" then
    Broadcast()
  end
end

local eventFrame = CreateFrame("Frame")
eventFrame:RegisterEvent("ADDON_LOADED")
eventFrame:RegisterEvent("PLAYER_LOGIN")
eventFrame:RegisterEvent("CHAT_MSG_ADDON")
pcall(eventFrame.RegisterEvent, eventFrame, "RAID_ROSTER_UPDATE")
pcall(eventFrame.RegisterEvent, eventFrame, "PARTY_MEMBERS_CHANGED")
pcall(eventFrame.RegisterEvent, eventFrame, "GROUP_ROSTER_UPDATE")
eventFrame:SetScript("OnEvent", function(_, event, arg1, arg2, arg3, arg4)
  if event == "ADDON_LOADED" and arg1 == "RaidNight" then
    RaidNightDB = RaidNightDB or {}
    db = RaidNightDB
    db.instanceId = db.instanceId or "karazhan"
    db.pickLimit = db.pickLimit or 2
    db.picks = db.picks or {}
    db.showAll = db.showAll or false
    if C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix then
      C_ChatInfo.RegisterAddonMessagePrefix(PREFIX)
    elseif RegisterAddonMessagePrefix then
      RegisterAddonMessagePrefix(PREFIX)
    end
  elseif event == "PLAYER_LOGIN" then
    playerClass = ClassFile()
    SetRoster(UnitName("player"), playerClass, Picks())
    if InRaidOrParty() then
      Send("Q")
      Broadcast()
    end
  elseif event == "CHAT_MSG_ADDON" then
    OnAddonMessage(arg1, arg2, arg3, arg4)
  else
    if InRaidOrParty() then Broadcast() end
  end
end)

SLASH_RAIDNIGHT1 = "/rn"
SLASH_RAIDNIGHT2 = "/raidnight"
SlashCmdList.RAIDNIGHT = function(msg)
  msg = strlower(strtrim(msg or ""))
  if msg == "export" then
    BuildUI()
    frame:Show()
    RaidNight_ShowExport()
    return
  end
  local limit = msg:match("^limit%s+(%d+)$")
  if limit then
    if not IsLead() then
      Print("Only the raid lead can set reserves.")
      return
    end
    db.pickLimit = math.max(1, math.min(10, tonumber(limit)))
    Broadcast()
    Print("Reserves set to " .. db.pickLimit .. ".")
    if frame and frame:IsShown() then RaidNight_Refresh() end
    return
  end
  RaidNight_Toggle()
end
