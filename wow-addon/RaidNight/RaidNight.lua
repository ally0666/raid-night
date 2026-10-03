local PREFIX = "RaidNight"
local ITEM_ROWS = 10
local ITEM_ROW_H = 36       -- tall enough for the item name and its slot line without touching the border
local ROSTER_ROWS = 16

local db
local frame
local searchBox
local itemButtons = {}
local pickButtons = {}
local rosterButtons = {}
local filtered = {}
local roster = {}
local bossFilter = "ALL"
local itemOffset = 0
local rosterOffset = 0
local playerClass
local lastBroadcast = 0
local UpdateHelper
local SubmittedKey -- defined next to SubmitPicks; RaidNight_Refresh needs it earlier
local SetupMinimapButton -- defined near the slash commands; the login event calls it
local sessionSheet = false
local sheetOpenedAt = 0
local snoozeUntil = 0
local quietHelperUntil = 0
local forceHelper = false
local nudgedKey
local helper
local broadcastPending = false
local syncPending = false
local HARD_LIMIT = 6
local remoteHard
local remoteHardInstance
local remoteHardFrom -- NameKey of the leader who sent remoteHard
local tourRunning = false
local tourIndex = 0
local tourToken = 0
local tourGlow
local StartTour
local PauseTour
local ShowPage
local LayoutPages
local wasGrouped = false
local groupSignature = ""
local itemIndex
local instanceIndex

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

-- Which game is running. TBC Anniversary (2.x) uses the built-in loot list.
-- Anything else (WoW Forever, or a future version) uses its own raid list,
-- and players reserve items by shift-clicking links or typing item IDs.
local BUILD_VERSION, _, _, TOC_VERSION = GetBuildInfo()
TOC_VERSION = tonumber(TOC_VERSION) or 0
local IS_TBC = (TOC_VERSION >= 20000 and TOC_VERSION < 30000)
  or (type(BUILD_VERSION) == "string" and strmatch(BUILD_VERSION, "^2%.") ~= nil)
if not IS_TBC then
  RaidNightData.instances = {
    { id = "barrow", name = "The Barrow Deeps" },
    { id = "fhyjal", name = "Hyjal Summit" },
    { id = "onyxia", name = "Onyxia's Lair" },
  }
  RaidNightData.items = {}
end
local DEFAULT_INSTANCE = RaidNightData.instances[1].id

-- Newer clients can hand back hidden ("secret") values that addons may not read.
-- Treat those as missing instead of erroring.
local function Plain(value)
  if issecretvalue and issecretvalue(value) then return nil end
  return value
end

local function NameKey(name)
  name = strlower(Plain(name) or "")
  return strmatch(name, "^([^-]+)") or name
end

local function PlayerName()
  return Plain(UnitName("player")) or ""
end

local function ClassFile()
  local _, class = UnitClass("player")
  return Plain(class) or "WARRIOR"
end

-- Returns the player's class file, or nil if the game has not provided it yet.
local function KnownClass()
  if not playerClass then
    local _, class = UnitClass("player")
    playerClass = Plain(class)
  end
  return playerClass
end

local function RaidCount()
  if GetNumRaidMembers then return GetNumRaidMembers() or 0 end
  if IsInRaid and IsInRaid() and GetNumGroupMembers then return GetNumGroupMembers() or 0 end
  return 0
end

local function PartyCount()
  if GetNumPartyMembers then return GetNumPartyMembers() or 0 end
  if IsInGroup and IsInGroup() and GetNumGroupMembers then return math.max(0, (GetNumGroupMembers() or 1) - 1) end
  return 0
end

local function InRaidOrParty()
  return RaidCount() > 0 or PartyCount() > 0
end

local function CommChannel()
  if RaidCount() > 0 then return "RAID" end
  if PartyCount() > 0 then return "PARTY" end
  return nil
end

local function IsLead()
  if UnitIsGroupLeader and UnitIsGroupLeader("player") then return true end
  if IsRaidLeader and IsRaidLeader() then return true end
  if IsPartyLeader and IsPartyLeader() then return true end
  return false
end

-- True if a party unit ("party1".."party4") is the party leader. Falls back to
-- the older party-leader API on clients without UnitIsGroupLeader.
local function UnitLeadsParty(unit)
  if UnitIsGroupLeader then
    return Plain(UnitIsGroupLeader(unit)) and true or false
  end
  if UnitIsPartyLeader then
    return Plain(UnitIsPartyLeader(unit)) and true or false
  end
  if GetPartyLeaderIndex then
    local index = Plain(GetPartyLeaderIndex())
    return type(index) == "number" and index > 0 and unit == "party" .. index
  end
  return false
end

-- NameKey of the current group leader, or nil if not grouped / roster not loaded yet.
local function LeaderKey()
  local raidN = RaidCount()
  if raidN > 0 then
    for i = 1, raidN do
      local name, rank = GetRaidRosterInfo(i)
      name, rank = Plain(name), Plain(rank)
      if name and rank == 2 then return NameKey(name) end
    end
    return nil
  end
  if PartyCount() > 0 then
    if IsLead() then return NameKey(PlayerName()) end
    for i = 1, PartyCount() do
      local unit = "party" .. i
      if UnitLeadsParty(unit) then
        local name = Plain(UnitName(unit))
        if name then return NameKey(name) end
      end
    end
  end
  return nil
end

-- Newer clients block addon messages and addon-sent chat during boss fights.
-- Anything we try to send then is held and sent once messaging opens up again.
local heldMessages = {}
local heldNotice = false
local flushPending = false
local FlushHeld -- assigned after Broadcast is defined

local function MessagingLocked()
  if C_ChatInfo and C_ChatInfo.InChatMessagingLockdown then
    return Plain(C_ChatInfo.InChatMessagingLockdown()) == true
  end
  return false
end

local function ScheduleFlush()
  if flushPending or not (C_Timer and C_Timer.After) then return end
  flushPending = true
  C_Timer.After(5, function()
    flushPending = false
    if FlushHeld then FlushHeld() end
  end)
end

local function Hold(kind, text)
  for _, m in ipairs(heldMessages) do
    if m.kind == kind and m.text == text then return end
  end
  if #heldMessages >= 20 then tremove(heldMessages, 1) end
  tinsert(heldMessages, { kind = kind, text = text })
  if not heldNotice then
    heldNotice = true
    Print("Messages are paused during the boss fight. Raid Night will send them when it ends.")
  end
  ScheduleFlush()
end

-- Returns false if the game refused the message because of the boss-fight lockdown.
local function RawSendAddon(payload, channel)
  if C_ChatInfo and C_ChatInfo.SendAddonMessage then
    local result = C_ChatInfo.SendAddonMessage(PREFIX, payload, channel)
    local lockdown = Enum and Enum.SendAddonMessageResult and Enum.SendAddonMessageResult.AddOnMessageLockdown
    if lockdown ~= nil and result == lockdown then return false end
  elseif SendAddonMessage then
    SendAddonMessage(PREFIX, payload, channel)
  end
  return true
end

local function Send(payload)
  local channel = CommChannel()
  if not channel then return end
  local head = strsub(payload, 1, 2)
  local isState = head == "P:" or head == "R:" or head == "H:"
  if MessagingLocked() or not RawSendAddon(payload, channel) then
    -- Picks, sheet settings, and hard reserves are resent fresh later, so only remember
    -- that one is owed. Holding an old hard-reserve list could undo a newer one.
    if isState then Hold("state", "") else Hold("addon", payload) end
  end
end

local function Announce(msg)
  local channel = CommChannel()
  if not channel then return end
  if MessagingLocked() then
    Hold("chat", msg)
    return
  end
  if C_ChatInfo and C_ChatInfo.SendChatMessage then
    pcall(C_ChatInfo.SendChatMessage, msg, channel)
  elseif SendChatMessage then
    pcall(SendChatMessage, msg, channel)
  end
end

local function InstanceName(id)
  for _, row in ipairs(RaidNightData.instances) do
    if row.id == id then return row.name end
  end
  return id
end

local function IsKnownInstance(id)
  if not instanceIndex then
    instanceIndex = {}
    for _, row in ipairs(RaidNightData.instances) do instanceIndex[row.id] = true end
  end
  return id ~= nil and instanceIndex[id] == true
end

local function ItemById(id)
  if not itemIndex then
    itemIndex = {}
    for _, item in ipairs(RaidNightData.items) do
      if itemIndex[item.id] == nil then itemIndex[item.id] = item end
    end
  end
  return itemIndex[id]
end

local customItems = {}
local itemRefreshPending = false

-- Ask the game to load an item's name; GET_ITEM_INFO_RECEIVED refreshes the window.
local function RequestItem(id)
  if C_Item and C_Item.RequestLoadItemDataByID then
    pcall(C_Item.RequestLoadItemDataByID, id)
  end
end

-- Name for any item id: built-in list first, then the game's item cache.
local function ItemName(id)
  local item = ItemById(id)
  if item then return item.name end
  local name
  if C_Item and C_Item.GetItemNameByID then name = Plain(C_Item.GetItemNameByID(id)) end
  if not name then RequestItem(id) end
  return name
end

local function IconFor(id)
  local tex
  if C_Item and C_Item.GetItemIconByID then tex = Plain(C_Item.GetItemIconByID(id)) end
  if not tex and GetItemIcon then tex = Plain(GetItemIcon(id)) end
  if tex then return tex end
  local item = ItemById(id)
  if item and item.icon then return "Interface\\Icons\\" .. item.icon end
  return "Interface\\Icons\\INV_Misc_QuestionMark"
end


-- Item id from a shift-clicked link or a typed number, or nil.
local function ParseItemId(text)
  if type(text) ~= "string" then return nil end
  local id = strmatch(text, "item:(%d+)") or strmatch(text, "^%s*(%d+)%s*$")
  id = tonumber(id)
  if id and id > 0 and id < 100000000 then return id end
  return nil
end

-- A list row for an item that isn't in the built-in loot list.
local function CustomItem(id)
  local item = customItems[id]
  if not item then
    item = { id = id, slot = "Added by link", boss = "Any boss", raid = "", classes = "" }
    customItems[id] = item
  end
  item.name = ItemName(id)
  return item
end

local function Picks()
  db.picks[db.instanceId] = db.picks[db.instanceId] or {}
  return db.picks[db.instanceId]
end

local function CleanIdList(list, maxN)
  local out, seen = {}, {}
  if type(list) ~= "table" then return out end
  for _, id in ipairs(list) do
    id = tonumber(id)
    if id and id > 0 and id < 100000000 and not seen[id] then
      seen[id] = true
      tinsert(out, id)
      if #out >= (maxN or HARD_LIMIT) then break end
    end
  end
  return out
end

-- The raid leader's hard reserves for the current raid. Saved on this character.
local function HardList()
  db.hard = db.hard or {}
  local list = db.hard[db.instanceId]
  if type(list) ~= "table" then
    list = {}
    db.hard[db.instanceId] = list
  end
  return list
end

local function ClearRemoteHard()
  remoteHard = nil
  remoteHardInstance = nil
  remoteHardFrom = nil
end

-- The hard reserves the current group leader sent for the current raid, or nil.
-- A list from a previous group or a previous leader is ignored.
local function CurrentRemoteHard()
  if not remoteHard or remoteHardInstance ~= db.instanceId then return nil end
  if remoteHardFrom == nil or remoteHardFrom ~= LeaderKey() then return nil end
  return remoteHard
end

-- Hard reserves showing on the sheet. In a group, that is whatever the raid leader last sent.
local function ActiveHard()
  if IsLead() or not InRaidOrParty() then
    return HardList()
  end
  return CurrentRemoteHard() or {}
end

local function IsHard(id)
  for _, hid in ipairs(ActiveHard()) do
    if hid == id then return true end
  end
  return false
end

-- Takes a hard-reserved item off this character's soft reserves.
-- Returns the names that were removed.
local function TakeHardReservedPicks(ids)
  local set = {}
  for _, id in ipairs(ids) do set[id] = true end
  local picks = Picks()
  local names = {}
  for i = #picks, 1, -1 do
    if set[picks[i]] then
      tinsert(names, 1, ItemName(picks[i]) or ("item " .. picks[i]))
      tremove(picks, i)
    end
  end
  return names
end

local function HasClass(item, classFile)
  if not item.classes or item.classes == "" then return true end
  if not classFile then return true end
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
  local linkedId = searchBox and ParseItemId(searchBox:GetText())
  if linkedId then
    tinsert(filtered, ItemById(linkedId) or CustomItem(linkedId))
    return
  end
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
  return IconFor(item.id)
end

-- instance: raid id these picks belong to (nil = unknown, e.g. sent by an older addon version)
local function SetRoster(name, class, picks, hasAddon, instance)
  local key = NameKey(name)
  local prev = roster[key] or {}
  roster[key] = {
    name = name,
    class = class or prev.class or "WARRIOR",
    picks = picks or prev.picks or {},
    hasAddon = hasAddon == nil and prev.hasAddon or hasAddon,
    lead = prev.lead,
    instance = instance,
  }
end

-- Picks stored for a group member, ignoring picks made for a different raid.
local function StoredPicks(stored)
  if not stored then return {} end
  if stored.instance and stored.instance ~= db.instanceId then return {} end
  return stored.picks or {}
end

local function GroupList()
  local list = {}
  local raidN = RaidCount()
  if raidN > 0 then
    for i = 1, raidN do
      local name, rank, _, _, _, classFile = GetRaidRosterInfo(i)
      name = Plain(name)
      if name then
        tinsert(list, { name = name, class = Plain(classFile) or "WARRIOR", lead = Plain(rank) == 2 })
      end
    end
    return list
  end
  tinsert(list, { name = PlayerName(), class = playerClass or ClassFile(), lead = IsLead() })
  for i = 1, PartyCount() do
    local unit = "party" .. i
    local name = Plain(UnitName(unit))
    local _, class = UnitClass(unit)
    if name then
      tinsert(list, { name = name, class = Plain(class) or "WARRIOR", lead = UnitLeadsParty(unit) })
    end
  end
  return list
end

-- Sorted list of member names (leader marked) used to detect real membership changes.
local function GroupSignature()
  if not InRaidOrParty() then return "" end
  local keys = {}
  for _, member in ipairs(GroupList()) do
    tinsert(keys, NameKey(member.name) .. (member.lead and "*" or ""))
  end
  table.sort(keys)
  return table.concat(keys, ",")
end

local function MergedRoster()
  local rows = {}
  local group = GroupList()
  if #group == 0 then
    tinsert(rows, {
      name = PlayerName(),
      class = playerClass or "WARRIOR",
      picks = Picks(),
      hasAddon = true,
      lead = false,
      you = true,
    })
    return rows
  end
  for _, member in ipairs(group) do
    local key = NameKey(member.name)
    local stored = roster[key]
    tinsert(rows, {
      name = member.name,
      class = member.class,
      picks = key == NameKey(PlayerName()) and Picks() or StoredPicks(stored),
      hasAddon = stored and stored.hasAddon or (key == NameKey(PlayerName())),
      lead = member.lead,
      you = key == NameKey(PlayerName()),
    })
  end
  table.sort(rows, function(a, b)
    if a.lead ~= b.lead then return a.lead end
    return strlower(a.name) < strlower(b.name)
  end)
  return rows
end

-- Returns a tidy https Discord invite, or nil if the text is not one. Only letters, digits
-- and dashes survive in the code, so the link is safe to put in chat and addon messages.
local function CleanDiscord(text)
  text = strtrim(Plain(text) or "")
  local rest = text:gsub("^[Hh][Tt][Tt][Pp][Ss]?://", ""):gsub("^[Ww][Ww][Ww]%.", "")
  local code = rest:match("^[Dd][Ii][Ss][Cc][Oo][Rr][Dd]%.[Gg][Gg]/([%w%-]+)/?$")
    or rest:match("^[Dd][Ii][Ss][Cc][Oo][Rr][Dd]%.[Cc][Oo][Mm]/[Ii][Nn][Vv][Ii][Tt][Ee]/([%w%-]+)/?$")
    or rest:match("^[Dd][Ii][Ss][Cc][Oo][Rr][Dd][Aa][Pp][Pp]%.[Cc][Oo][Mm]/[Ii][Nn][Vv][Ii][Tt][Ee]/([%w%-]+)/?$")
  if not code or #code > 40 then return nil end
  return "https://discord.gg/" .. code
end

-- The Discord invite for this group: the leader's own, or the one the leader sent us.
local function GroupDiscord()
  if not db then return nil end
  if IsLead() or not InRaidOrParty() then return db.discord end
  return db.groupDiscord
end

local function Broadcast(force)
  -- Class is unknown until the game provides it; PLAYER_LOGIN sends a forced broadcast then.
  if not KnownClass() then return end
  local now = GetTime and GetTime() or 0
  if not force and now > 0 and now - lastBroadcast < 0.4 then
    -- Too soon: send the latest state once the throttle window ends instead of dropping it.
    if C_Timer and C_Timer.After then
      if not broadcastPending then
        broadcastPending = true
        C_Timer.After(0.45 - (now - lastBroadcast), function()
          broadcastPending = false
          Broadcast(true)
        end)
      end
      return
    end
  end
  lastBroadcast = now
  SetRoster(PlayerName(), playerClass, Picks(), true, db.instanceId)
  local picks = Picks()
  -- 4th field (raid id) is ignored by 1.3.4 and older, which split into at most 4 parts.
  Send("P:" .. playerClass .. ":" .. table.concat(picks, ",") .. ":" .. db.instanceId)
  -- Only a leader who has started a sheet tells the group about it. Without this check,
  -- every ordinary party led by someone with the addon got a raid sheet pushed at it.
  if IsLead() and db.shared then
    Send("R:" .. db.instanceId .. ":" .. tostring(db.pickLimit) .. ":" .. (db.locked and "1" or "0"))
    -- H is the raid leader's hard reserves. Older clients ignore an unknown message kind.
    Send("H:" .. db.instanceId .. ":" .. table.concat(HardList(), ","))
    -- D is the leader's Discord invite (empty clears it).
    Send("D:" .. (db.discord or ""))
  end
end

-- Ask the group to resend their state, once, after a short delay (e.g. roster not loaded yet).
local function RequestSync(delay)
  if not (C_Timer and C_Timer.After) then
    Send("Q")
    return
  end
  if syncPending then return end
  syncPending = true
  C_Timer.After(delay or 2, function()
    syncPending = false
    Send("Q")
  end)
end

-- Sends everything held back during a boss fight, once messaging is allowed again.
FlushHeld = function()
  if #heldMessages == 0 then return end
  if MessagingLocked() then
    ScheduleFlush()
    return
  end
  local list = heldMessages
  heldMessages = {}
  heldNotice = false
  for _, m in ipairs(list) do
    if m.kind == "state" then
      Broadcast(true)
    elseif m.kind == "addon" then
      Send(m.text)
    elseif m.kind == "chat" then
      Announce(m.text)
    end
  end
end

-- Clears per-group state so a lock or started sheet does not carry over to the next group.
local function ResetSession()
  db.locked = false
  db.shared = false
  db.groupDiscord = nil
  sessionSheet = false
  sheetOpenedAt = 0
  nudgedKey = nil
  ClearRemoteHard()
  wipe(roster)
  if playerClass then SetRoster(PlayerName(), playerClass, Picks(), true, db.instanceId) end
end

-- Resets only if still solo a few seconds later, so a brief "not grouped" reading
-- (login, /reload, loading screens) never unlocks a raid.
local soloCheckPending = false
local function ResetIfStillSolo()
  if not (C_Timer and C_Timer.After) then
    if not InRaidOrParty() then ResetSession() end
    return
  end
  if soloCheckPending then return end
  soloCheckPending = true
  C_Timer.After(3, function()
    soloCheckPending = false
    if InRaidOrParty() then return end
    ResetSession()
    if frame and frame:IsShown() then
      RaidNight_Refresh()
    elseif UpdateHelper then
      UpdateHelper()
    end
  end)
end

local function SetLocked(locked, announce)
  db.locked = locked and true or false
  Broadcast(true)
  if announce then
    if db.locked then
      Announce("Raid Night reserves are LOCKED. No more changes.")
      Print("SRs are locked. Click Unlock SRs if you need to open them again.")
    else
      Announce("Raid Night reserves are unlocked. You can change picks again.")
      Print("SRs are open again.")
    end
  end
  if frame then RaidNight_Refresh() end
end

local function ShareSheet()
  if not InRaidOrParty() then
    Print("Invite people to a party or raid first. Then click Start sheet.")
    return
  end
  if not IsLead() then
    Print("Only the party/raid leader can start the sheet.")
    return
  end
  db.shared = true
  sessionSheet = true
  sheetOpenedAt = GetTime and GetTime() or 0
  snoozeUntil = 0
  nudgedKey = nil
  db.locked = false
  Broadcast(true)
  Send("Q")
  Announce("Raid Night is open for " .. InstanceName(db.instanceId) .. ". Type /rn and pick " .. db.pickLimit .. " reserve" .. (db.pickLimit == 1 and "" or "s") .. ".")
  if db.discord then Announce("Raid Discord: " .. db.discord) end
  Print("Sheet shared. The group should type /rn to pick.")
  if frame then RaidNight_Refresh() end
  if UpdateHelper then UpdateHelper() end
  if C_Timer and C_Timer.After then
    C_Timer.After(8.2, function()
      if UpdateHelper then UpdateHelper() end
    end)
  end
end

-- Back to the top of the item list, moving the scrollbar too so it matches the rows shown.
local function ResetItemScroll()
  itemOffset = 0
  if frame and frame.itemScroll then
    if FauxScrollFrame_SetOffset then FauxScrollFrame_SetOffset(frame.itemScroll, 0) end
    local bar = frame.itemScroll.ScrollBar or _G[frame.itemScroll:GetName() .. "ScrollBar"]
    if bar and bar:GetValue() ~= 0 then bar:SetValue(0) end
  end
end

-- Boss filters are per raid, so a new raid starts on "All bosses".
local function ResetBossFilter()
  bossFilter = "ALL"
  if frame and frame.bossDrop then UIDropDownMenu_SetText(frame.bossDrop, "All bosses") end
end

function RaidNight_Refresh()
  if not frame then
    if UpdateHelper then UpdateHelper() end
    return
  end
  RebuildFilter()
  local picks = Picks()
  local lead = IsLead()
  local grouped = InRaidOrParty()

  if db.locked then
    if lead then
      frame.status:SetText("SRs are LOCKED. Nobody can change picks or hard reserves until you unlock.")
    else
      frame.status:SetText("SRs are LOCKED by the lead. Picks cannot be changed.")
    end
  elseif not grouped then
    frame.status:SetText("Solo. Invite a party/raid, then the leader clicks Start sheet.")
  elseif lead then
    frame.status:SetText("You are the lead. Click an item to soft reserve. Right-click to hard reserve.")
  else
    frame.status:SetText("Lead chose " .. InstanceName(db.instanceId) .. " · " .. db.pickLimit .. " each. Click items to reserve.")
  end
  local lockTag = db.locked and " · LOCKED" or ""
  local sub = InstanceName(db.instanceId) .. " · " .. db.pickLimit .. " reserve" .. (db.pickLimit == 1 and "" or "s") .. lockTag
  local hardNames = {}
  local hardSet = {}
  for _, id in ipairs(ActiveHard()) do
    hardSet[id] = true
    tinsert(hardNames, ItemName(id) or ("item " .. id))
  end
  if #hardNames > 0 then
    sub = sub .. "  ·  HR: " .. table.concat(hardNames, ", ")
  end
  frame.subtitle:SetText(sub)
  local submitted = #picks > 0 and db.submitted == SubmittedKey()
  if frame.submitBtn then
    if db.locked then
      frame.submitBtn:Disable()
      frame.submitBtn:SetText(submitted and "Submitted" or "Locked")
    elseif #picks == 0 then
      frame.submitBtn:Disable()
      frame.submitBtn:SetText("Submit reserves")
    elseif submitted then
      frame.submitBtn:Enable()
      frame.submitBtn:SetText("|cff4ecb8dSubmitted|r")
    else
      frame.submitBtn:Enable()
      frame.submitBtn:SetText("Submit reserves")
    end
  end
  if frame.hint then
    if submitted then
      frame.hint:SetText(grouped and "You're all set. Your raid leader can see your picks." or "Saved. They send when you join the group.")
    elseif #picks > 0 and not db.locked then
      frame.hint:SetText(#picks < db.pickLimit and ("Saved. " .. #picks .. " of " .. db.pickLimit .. " picked.") or "All picked. Click Submit reserves.")
    elseif lead or not grouped then
      frame.hint:SetText("Right-click to hard reserve.")
    else
      frame.hint:SetText("Everyone needs the addon for picks to show.")
    end
  end

  if frame.shareBtn then
    if lead or not grouped then
      frame.shareBtn:Enable()
      frame.shareBtn:SetText(grouped and "Start sheet" or "Start sheet (join a group)")
    else
      frame.shareBtn:Disable()
      frame.shareBtn:SetText("Leader starts the sheet")
    end
  end
  if frame.minusBtn and frame.plusBtn then
    if lead and not db.locked then
      frame.minusBtn:Enable()
      frame.plusBtn:Enable()
    else
      frame.minusBtn:Disable()
      frame.plusBtn:Disable()
    end
  end
  if frame.lockBtn then
    if lead then
      frame.lockBtn:Enable()
      frame.lockBtn:SetText(db.locked and "Unlock SRs" or "Lock SRs")
    else
      frame.lockBtn:Disable()
      frame.lockBtn:SetText(db.locked and "SRs locked" or "Lead locks SRs")
    end
  end
  if frame.clearSheetBtn then
    if lead then
      frame.clearSheetBtn:Enable()
      frame.clearSheetBtn:SetText("Clear sheet")
    else
      frame.clearSheetBtn:Disable()
      frame.clearSheetBtn:SetText("Lead clears the sheet")
    end
  end
  if frame.limitLabel then
    frame.limitLabel:SetText(db.pickLimit .. " each")
  end
  if frame.discordBox then
    if not frame.discordBox:HasFocus() then frame.discordBox:SetText(GroupDiscord() or "") end
    if lead or not grouped then
      frame.discordNote:SetText("Paste your Discord invite and press Enter. The raid sees it here and in raid chat.")
    elseif GroupDiscord() then
      frame.discordNote:SetText("The raid leader's Discord. Click the link, press Ctrl+C, then paste it in your browser.")
    else
      frame.discordNote:SetText("The raid leader has not added a Discord invite.")
    end
  end
  if frame.instDrop then
    UIDropDownMenu_SetText(frame.instDrop, InstanceName(db.instanceId))
    -- In a group, only the leader picks the raid.
    if lead or not grouped then
      if UIDropDownMenu_EnableDropDown then UIDropDownMenu_EnableDropDown(frame.instDrop) end
    else
      if UIDropDownMenu_DisableDropDown then UIDropDownMenu_DisableDropDown(frame.instDrop) end
    end
  end

  for i = 1, 6 do
    local btn = pickButtons[i]
    if i > db.pickLimit then
      btn:Hide()
    else
      btn:Show()
      local id = picks[i]
      if id then
        btn.icon:SetTexture(IconFor(id))
        btn.text:SetText(ItemName(id) or ("Item " .. id))
        btn.itemId = id
      else
        btn.icon:SetTexture("Interface\\Icons\\INV_Misc_QuestionMark")
        btn.text:SetText("Pick " .. i .. " of " .. db.pickLimit)
        btn.itemId = nil
      end
    end
  end

  local maxItem = math.max(0, #filtered - ITEM_ROWS)
  if itemOffset > maxItem then itemOffset = maxItem end
  FauxScrollFrame_Update(frame.itemScroll, #filtered, ITEM_ROWS, ITEM_ROW_H)
  if frame.emptyText then
    if #filtered == 0 then frame.emptyText:Show() else frame.emptyText:Hide() end
  end
  for i = 1, ITEM_ROWS do
    local btn = itemButtons[i]
    local item = filtered[i + itemOffset]
    if item then
      btn:Show()
      btn.item = item
      btn.icon:SetTexture(IconTexture(item))
      local selected = 0
      for _, id in ipairs(picks) do
        if id == item.id then selected = selected + 1 end
      end
      local shownName = item.name or ("Looking up item " .. item.id .. "...")
      local hard = hardSet[item.id] == true
      btn.hard = hard
      if hard then
        btn.name:SetText(shownName .. "  HR")
        btn.name:SetTextColor(0.95, 0.75, 0.30)
        btn.meta:SetText("Hard reserved · " .. item.slot .. " · " .. item.boss)
        btn:SetBackdropColor(0.42, 0.28, 0.06, 0.95)
      else
        btn.name:SetTextColor(1, 1, 1)
        if selected > 1 then
          btn.name:SetText(shownName .. "  x" .. selected)
        else
          btn.name:SetText(shownName)
        end
        btn.meta:SetText(item.slot .. " · " .. item.boss)
        if selected > 0 then
          btn:SetBackdropColor(0.35, 0.22, 0.55, 0.9)
        elseif not HasClass(item, playerClass) then
          btn:SetBackdropColor(0.08, 0.08, 0.1, 0.7)
        else
          btn:SetBackdropColor(0.08, 0.11, 0.16, 0.9)
        end
      end
    else
      btn:Hide()
      btn.item = nil
    end
  end

  local rows = MergedRoster()
  local signed = 0
  for _, row in ipairs(rows) do
    if row.hasAddon and #row.picks > 0 then signed = signed + 1 end
  end
  frame.rosterTitle:SetText("Group picks  " .. signed .. "/" .. #rows)
  local maxRoster = math.max(0, #rows - ROSTER_ROWS)
  if rosterOffset > maxRoster then rosterOffset = maxRoster end
  FauxScrollFrame_Update(frame.rosterScroll, #rows, ROSTER_ROWS, 20)
  for i = 1, ROSTER_ROWS do
    local btn = rosterButtons[i]
    local row = rows[i + rosterOffset]
    if row then
      btn:Show()
      local c = CLASS_COLOR[row.class] or { 0.8, 0.8, 0.8 }
      local tag = row.name
      if row.lead then tag = tag .. " (lead)" end
      if row.you then tag = tag .. " (you)" end
      local labels = {}
      local showHard = row.lead or (not grouped and row.you)
      if showHard then
        for _, id in ipairs(ActiveHard()) do
          tinsert(labels, "HR " .. (ItemName(id) or ("item " .. id)))
        end
      end
      for _, id in ipairs(row.picks) do
        if not hardSet[id] then
          tinsert(labels, ItemName(id) or ("item " .. id))
        end
      end
      local suffix
      if not grouped then
        suffix = #labels > 0 and table.concat(labels, ", ") or "not shared yet"
      elseif not row.hasAddon then
        suffix = "needs addon"
      elseif #labels == 0 then
        suffix = "no picks yet"
      else
        suffix = table.concat(labels, ", ")
      end
      btn.name:SetText(tag)
      btn.name:SetTextColor(c[1], c[2], c[3])
      btn.status:SetText(suffix)
    else
      btn:Hide()
    end
  end

  if UpdateHelper then UpdateHelper() end
end

local function DropSlot(index)
  if db.locked then
    Print("SRs are locked. The lead has to unlock them before picks can change.")
    return
  end
  local picks = Picks()
  if picks[index] then
    tremove(picks, index)
    Broadcast()
    RaidNight_Refresh()
  end
end

local function TogglePick(item)
  if not item then return end
  if not item.name then
    Print("That item hasn't loaded yet. Try again in a moment, or check the item ID.")
    return
  end
  if db.locked then
    Print("SRs are locked. The lead has to unlock them before picks can change.")
    return
  end
  if IsHard(item.id) then
    if IsLead() or not InRaidOrParty() then
      Print(item.name .. " is hard reserved. Right-click it to drop the hard reserve.")
    else
      Print("The raid leader hard reserved " .. item.name .. ".")
    end
    return
  end
  local picks = Picks()
  if #picks >= db.pickLimit then
    Print("You already have " .. db.pickLimit .. " picks. Click one of your slots to drop it.")
    return
  end
  tinsert(picks, item.id)
  Broadcast()
  RaidNight_Refresh()
end

local function CanHardReserve()
  return IsLead() or not InRaidOrParty()
end

local function ToggleHard(item)
  if not item then return end
  if not item.name then
    Print("That item hasn't loaded yet. Try again in a moment, or check the item ID.")
    return
  end
  if not CanHardReserve() then
    Print("Only the raid leader can hard reserve items.")
    return
  end
  if db.locked then
    Print("SRs are locked. Unlock them before hard reserves can change.")
    return
  end
  local list = HardList()
  for i, id in ipairs(list) do
    if id == item.id then
      tremove(list, i)
      if InRaidOrParty() then
        Announce("Raid Night dropped the hard reserve on " .. item.name .. ".")
      end
      Print("Dropped the hard reserve on " .. item.name .. ".")
      Broadcast(true)
      RaidNight_Refresh()
      return
    end
  end
  if #list >= HARD_LIMIT then
    Print("You can hard reserve up to " .. HARD_LIMIT .. " items. Right-click one to drop it.")
    return
  end
  tinsert(list, item.id)
  local dropped = TakeHardReservedPicks({ item.id })
  if InRaidOrParty() then
    Announce("Raid Night hard reserved " .. item.name .. ".")
  end
  if #dropped > 0 then
    Print("Hard reserved " .. item.name .. ". It was taken off your soft reserves.")
  else
    Print("Hard reserved " .. item.name .. ".")
  end
  Broadcast(true)
  RaidNight_Refresh()
end

-- Your soft reserves only. Does not wipe the raid, the lock, or anyone else.
-- Hard reserves belong to the sheet, so they stay unless you are not in a group.
local function ClearMine()
  db.picks = {}
  if not InRaidOrParty() then
    db.hard = {}
    ClearRemoteHard()
  end
  SetRoster(PlayerName(), playerClass, Picks(), true, db.instanceId)
  Broadcast(true)
  if InRaidOrParty() then
    Print("Your soft reserves were cleared.")
  else
    Print("Your picks and hard reserves were cleared.")
  end
  if frame then RaidNight_Refresh() end
  if UpdateHelper then UpdateHelper() end
end

-- Picks are sent the moment they are clicked; Submit is there so people know they are done.
SubmittedKey = function()
  return db.instanceId .. ":" .. table.concat(Picks(), ",")
end

local function SubmitPicks()
  local picks = Picks()
  if #picks == 0 then
    Print("Pick at least one item first.")
    return
  end
  Broadcast(true)
  db.submitted = SubmittedKey()
  local names = {}
  for _, id in ipairs(picks) do tinsert(names, ItemName(id) or ("item " .. id)) end
  if InRaidOrParty() then
    Print("Reserves submitted: " .. table.concat(names, ", ") .. ". Your raid leader can see them on the Group tab.")
  else
    Print("Reserves saved: " .. table.concat(names, ", ") .. ". They go to the raid leader as soon as you join the group.")
  end
  if frame then RaidNight_Refresh() end
  if UpdateHelper then UpdateHelper() end
end

-- The whole sheet: everyone's picks and the raid leader's hard reserves.
local function ClearSheet()
  if not IsLead() then
    Print("Only the raid leader can clear the sheet.")
    return
  end
  db.picks = {}
  db.hard = {}
  ClearRemoteHard()
  db.locked = false
  wipe(roster)
  SetRoster(PlayerName(), playerClass, Picks(), true, db.instanceId)
  -- Send the clear first, then our fresh state, so the group does not wipe our entry
  -- after reading it. Everyone who gets the clear resends their own (empty) picks.
  if InRaidOrParty() then Send("C") end
  Broadcast(true)
  if InRaidOrParty() then
    Announce("Raid Night data was cleared. Type /rn to pick again.")
  end
  Print("The Raid Night sheet was cleared.")
  snoozeUntil = 0
  nudgedKey = nil
  if frame then RaidNight_Refresh() end
  if UpdateHelper then UpdateHelper() end
end

local function ConfirmClearMine()
  StaticPopup_Show("RAIDNIGHT_CLEAR_MINE")
end

local function ConfirmClearSheet()
  if not IsLead() then
    Print("Only the raid leader can clear the sheet.")
    return
  end
  StaticPopup_Show("RAIDNIGHT_CLEAR_SHEET")
end

StaticPopupDialogs["RAIDNIGHT_CLEAR_MINE"] = {
  text = "Clear your own picks on this character?\nThis does not clear anyone else's reserves.",
  button1 = YES,
  button2 = NO,
  OnAccept = ClearMine,
  timeout = 0,
  whileDead = 1,
  hideOnEscape = 1,
  preferredIndex = 3,
}

StaticPopupDialogs["RAIDNIGHT_CLEAR_SHEET"] = {
  text = "Clear the sheet for the whole raid?\nEveryone's picks and hard reserves will be removed.",
  button1 = YES,
  button2 = NO,
  OnAccept = ClearSheet,
  timeout = 0,
  whileDead = 1,
  hideOnEscape = 1,
  preferredIndex = 3,
}

local function ChangeLimit(delta)
  if not IsLead() then
    Print("Only the party/raid leader can change how many reserves each person gets.")
    return
  end
  if db.locked then
    Print("Unlock SRs before changing the reserve count.")
    return
  end
  db.pickLimit = math.max(1, math.min(6, (db.pickLimit or 2) + delta))
  local picks = Picks()
  while #picks > db.pickLimit do tremove(picks) end
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
  frame:SetSize(580, 700)
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
  frame:SetScript("OnHide", function()
    if PauseTour then PauseTour() end
    if UpdateHelper then UpdateHelper() end
  end)
  frame:SetScript("OnShow", function()
    if db and not db.tourDone and not tourRunning and StartTour then
      StartTour(false)
    end
  end)
  tinsert(UISpecialFrames, "RaidNightFrame")

  local title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", 16, -12)
  title:SetText("Raid Night")
  title:SetTextColor(0.89, 0.71, 0.34)

  frame.subtitle = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  frame.subtitle:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -2)
  frame.subtitle:SetWidth(520)
  frame.subtitle:SetJustifyH("LEFT")
  frame.subtitle:SetWordWrap(false)

  frame.status = frame:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  frame.status:SetPoint("TOPLEFT", 16, -46)
  frame.status:SetPoint("RIGHT", -16, 0)
  frame.status:SetHeight(14)
  frame.status:SetJustifyH("LEFT")
  frame.status:SetWordWrap(false)

  local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", 2, 2)

  local instLabel = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  instLabel:SetPoint("TOPLEFT", 16, -68)
  instLabel:SetText("Raid")
  frame.instLabel = instLabel

  local inst = CreateFrame("Frame", "RaidNightInstanceDrop", frame, "UIDropDownMenuTemplate")
  inst:SetPoint("TOPLEFT", 0, -80)
  frame.instDrop = inst
  UIDropDownMenu_SetWidth(inst, 170)
  UIDropDownMenu_Initialize(inst, function()
    for _, row in ipairs(RaidNightData.instances) do
      local info = UIDropDownMenu_CreateInfo()
      info.text = row.name
      info.checked = db.instanceId == row.id
      info.func = function()
        if db.locked then
          Print("Unlock SRs before changing the raid.")
          return
        end
        if InRaidOrParty() and not IsLead() then
          Print("Only the party/raid leader can change the raid.")
          return
        end
        db.instanceId = row.id
        ResetBossFilter()
        ResetItemScroll()
        UIDropDownMenu_SetText(inst, row.name)
        if IsLead() then Broadcast() end
        RaidNight_Refresh()
      end
      UIDropDownMenu_AddButton(info)
    end
  end)

  local bossDrop = CreateFrame("Frame", "RaidNightBossDrop", frame, "UIDropDownMenuTemplate")
  bossDrop:SetPoint("LEFT", inst, "RIGHT", -16, 0)
  UIDropDownMenu_SetWidth(bossDrop, 130)
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
  frame.bossDrop = bossDrop

  frame.minusBtn = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
  frame.minusBtn:SetSize(22, 22)
  frame.minusBtn:SetPoint("TOPRIGHT", -150, -86)
  frame.minusBtn:SetText("-")
  frame.minusBtn:SetScript("OnClick", function() ChangeLimit(-1) end)

  frame.limitLabel = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  frame.limitLabel:SetPoint("LEFT", frame.minusBtn, "RIGHT", 6, 0)

  frame.plusBtn = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
  frame.plusBtn:SetSize(22, 22)
  frame.plusBtn:SetPoint("LEFT", frame.limitLabel, "RIGHT", 6, 0)
  frame.plusBtn:SetText("+")
  frame.plusBtn:SetScript("OnClick", function() ChangeLimit(1) end)

  frame.shareBtn = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
  frame.shareBtn:SetSize(360, 24)
  frame.shareBtn:SetPoint("TOPLEFT", 16, -118)
  frame.shareBtn:SetText("Start sheet")
  frame.shareBtn:SetScript("OnClick", ShareSheet)

  frame.lockBtn = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
  frame.lockBtn:SetSize(180, 24)
  frame.lockBtn:SetPoint("LEFT", frame.shareBtn, "RIGHT", 8, 0)
  frame.lockBtn:SetText("Lock SRs")
  frame.lockBtn:SetScript("OnClick", function()
    if not IsLead() then
      Print("Only the party/raid leader can lock or unlock SRs.")
      return
    end
    if not InRaidOrParty() then
      Print("Join a party or raid first.")
      return
    end
    SetLocked(not db.locked, true)
  end)

  for i = 1, 6 do
    local slot = i
    local btn = CreateFrame("Button", nil, frame, template)
    btn:SetSize(176, 32)
    local col = ((i - 1) % 3)
    local row = math.floor((i - 1) / 3)
    btn:SetPoint("TOPLEFT", 16 + col * 182, -150 - row * 36)
    MakeBackdrop(btn)
    btn:SetBackdropColor(0.05, 0.05, 0.07, 0.9)
    btn.icon = btn:CreateTexture(nil, "ARTWORK")
    btn.icon:SetSize(24, 24)
    btn.icon:SetPoint("LEFT", 4, 0)
    btn.text = btn:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    btn.text:SetPoint("LEFT", btn.icon, "RIGHT", 6, 0)
    btn.text:SetPoint("RIGHT", -4, 0)
    btn.text:SetJustifyH("LEFT")
    btn:SetScript("OnClick", function()
      DropSlot(slot)
    end)
    pickButtons[i] = btn
  end

  searchBox = CreateFrame("EditBox", "RaidNightSearch", frame, "InputBoxTemplate")
  searchBox:SetSize(300, 20)
  searchBox:SetPoint("TOPLEFT", 24, -228)
  searchBox:SetAutoFocus(false)
  searchBox:SetScript("OnTextChanged", function()
    ResetItemScroll()
    RaidNight_Refresh()
  end)
  -- Shift-clicking an item (bags, chat, loot, journal) while the search box is
  -- focused puts that item in the box so it can be reserved.
  if hooksecurefunc then
    local function TakeLink(text)
      if searchBox and searchBox:HasFocus() and type(text) == "string" and ParseItemId(text) then
        searchBox:SetText(text)
      end
    end
    if ChatFrameUtil and ChatFrameUtil.InsertLink then
      hooksecurefunc(ChatFrameUtil, "InsertLink", TakeLink)
    elseif ChatEdit_InsertLink then
      hooksecurefunc("ChatEdit_InsertLink", TakeLink)
    end
  end

  local showAll = CreateFrame("CheckButton", "RaidNightShowAll", frame, "UICheckButtonTemplate")
  showAll:SetPoint("LEFT", searchBox, "RIGHT", 8, 0)
  showAll.text = showAll:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  showAll.text:SetPoint("LEFT", showAll, "RIGHT", 0, 0)
  showAll.text:SetText("Show all classes")
  showAll:SetChecked(db.showAll)
  showAll:SetScript("OnClick", function(self)
    db.showAll = self:GetChecked() and true or false
    RaidNight_Refresh()
  end)
  frame.showAll = showAll

  local itemScroll = CreateFrame("ScrollFrame", "RaidNightItemScroll", frame, "FauxScrollFrameTemplate")
  itemScroll:SetPoint("TOPLEFT", 12, -256)
  itemScroll:SetPoint("RIGHT", -32, 0)
  itemScroll:SetHeight(220)
  frame.emptyText = frame:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  frame.emptyText:SetPoint("TOPLEFT", itemScroll, "TOPLEFT", 12, -12)
  frame.emptyText:SetWidth(480)
  frame.emptyText:SetJustifyH("LEFT")
  if IS_TBC then
    frame.emptyText:SetText("Nothing matches. You can also shift-click any item link into the search box, or type an item ID.")
  else
    frame.emptyText:SetText("Shift-click an item link into the search box (or type an item ID) to reserve it.")
  end
  frame.itemScroll = itemScroll
  itemScroll:SetScript("OnVerticalScroll", function(self, offset)
    FauxScrollFrame_OnVerticalScroll(self, offset, ITEM_ROW_H, function()
      itemOffset = FauxScrollFrame_GetOffset(self)
      RaidNight_Refresh()
    end)
  end)

  for i = 1, ITEM_ROWS do
    local btn = CreateFrame("Button", nil, frame, template)
    btn:SetSize(520, ITEM_ROW_H - 4)
    btn:SetPoint("TOPLEFT", itemScroll, "TOPLEFT", 4, -2 - (i - 1) * ITEM_ROW_H)
    MakeBackdrop(btn)
    btn.icon = btn:CreateTexture(nil, "ARTWORK")
    btn.icon:SetSize(26, 26)
    btn.icon:SetPoint("LEFT", 4, 0)
    btn.name = btn:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    btn.name:SetPoint("LEFT", btn.icon, "RIGHT", 8, 7)
    btn.name:SetPoint("RIGHT", -8, 7)
    btn.name:SetJustifyH("LEFT")
    btn.meta = btn:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    btn.meta:SetPoint("TOPLEFT", btn.name, "BOTTOMLEFT", 0, -3)
    btn:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    btn:SetScript("OnClick", function(self, button)
      if not self.item then return end
      if button == "RightButton" then
        ToggleHard(self.item)
      else
        TogglePick(self.item)
      end
    end)
    btn:SetScript("OnEnter", function(self)
      if not self.item then return end
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      GameTooltip:SetHyperlink("item:" .. self.item.id)
      if self.hard then
        GameTooltip:AddLine("Hard reserved by the raid leader", 0.95, 0.75, 0.30)
      end
      if IsLead() or not InRaidOrParty() then
        GameTooltip:AddLine(self.hard and "Right-click to drop the hard reserve" or "Right-click to hard reserve", 0.95, 0.75, 0.30)
      else
        GameTooltip:AddLine("Only the raid leader can hard reserve", 0.8, 0.8, 0.8)
      end
      GameTooltip:Show()
    end)
    btn:SetScript("OnLeave", function() GameTooltip:Hide() end)
    itemButtons[i] = btn
  end

  frame.rosterTitle = frame:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  frame.rosterTitle:SetPoint("TOPLEFT", 16, -490)
  frame.rosterTitle:SetText("Group picks")

  local rosterPanel = CreateFrame("Frame", nil, frame, template)
  rosterPanel:SetPoint("TOPLEFT", 16, -506)
  rosterPanel:SetPoint("BOTTOMRIGHT", -16, 48)
  MakeBackdrop(rosterPanel)
  rosterPanel:SetBackdropColor(0.03, 0.04, 0.06, 0.9)
  frame.rosterPanel = rosterPanel

  local rosterScroll = CreateFrame("ScrollFrame", "RaidNightRosterScroll", rosterPanel, "FauxScrollFrameTemplate")
  rosterScroll:SetPoint("TOPLEFT", 4, -4)
  rosterScroll:SetPoint("BOTTOMRIGHT", -24, 4)
  frame.rosterScroll = rosterScroll
  rosterScroll:SetScript("OnVerticalScroll", function(self, offset)
    FauxScrollFrame_OnVerticalScroll(self, offset, 20, function()
      rosterOffset = FauxScrollFrame_GetOffset(self)
      RaidNight_Refresh()
    end)
  end)

  for i = 1, ROSTER_ROWS do
    local btn = CreateFrame("Button", nil, rosterPanel)
    btn:SetSize(500, 18)
    btn:SetPoint("TOPLEFT", 8, -4 - (i - 1) * 20)
    btn.name = btn:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    btn.name:SetPoint("LEFT", 0, 0)
    btn.name:SetWidth(150)
    btn.name:SetHeight(16)
    btn.name:SetJustifyH("LEFT")
    btn.name:SetWordWrap(false)
    btn.status = btn:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    btn.status:SetPoint("LEFT", btn.name, "RIGHT", 8, 0)
    btn.status:SetPoint("RIGHT", btn, "RIGHT", -4, 0)
    btn.status:SetHeight(16)
    btn.status:SetJustifyH("LEFT")
    btn.status:SetWordWrap(false)
    rosterButtons[i] = btn
  end

  local export = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
  export:SetSize(110, 24)
  export:SetPoint("BOTTOMLEFT", 16, 14)
  export:SetText("Gargul CSV")
  export:SetScript("OnClick", function()
    RaidNight_ShowExport()
  end)
  frame.exportBtn = export

  local clearMine = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
  clearMine:SetSize(120, 24)
  clearMine:SetPoint("BOTTOMLEFT", 16, 14)
  clearMine:SetText("Clear my picks")
  clearMine:SetScript("OnClick", ConfirmClearMine)
  frame.clearMineBtn = clearMine

  local clearSheet = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
  clearSheet:SetSize(180, 24)
  clearSheet:SetPoint("TOPLEFT", 16, -300)
  clearSheet:SetText("Clear sheet")
  clearSheet:SetScript("OnClick", ConfirmClearSheet)
  frame.clearSheetBtn = clearSheet

  local showMe = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
  showMe:SetSize(140, 24)
  showMe:SetPoint("TOPLEFT", 16, -340)
  showMe:SetText("Show me around")
  showMe:SetScript("OnClick", function()
    if StartTour then StartTour(true) end
  end)
  frame.tourBtn = showMe

  local submit = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
  submit:SetSize(150, 24)
  submit:SetPoint("BOTTOMRIGHT", -16, 14)
  submit:SetText("Submit reserves")
  submit:SetScript("OnClick", SubmitPicks)
  frame.submitBtn = submit

  local hint = frame:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  hint:SetPoint("LEFT", clearMine, "RIGHT", 10, 0)
  hint:SetPoint("RIGHT", submit, "LEFT", -10, 0)
  hint:SetJustifyH("LEFT")
  hint:SetWordWrap(false)
  hint:SetText("Everyone needs the addon for picks to show.")
  frame.hint = hint

  LayoutPages()
end

ShowPage = function(name)
  if not frame or not frame.pagePicks then return end
  if name ~= "group" and name ~= "raid" then name = "picks" end
  if CloseDropDownMenus then CloseDropDownMenus() end
  if db then db.page = name end
  frame.pagePicks:SetShown(name == "picks")
  frame.pageGroup:SetShown(name == "group")
  frame.pageRaid:SetShown(name == "raid")
  local labels = { picks = "Picks", group = "Group", raid = "Raid" }
  for id, btn in pairs(frame.tabs) do
    if id == name then
      btn:SetText("|cffe2b657" .. labels[id] .. "|r")
    else
      btn:SetText(labels[id])
    end
  end
  if db and frame:IsShown() then RaidNight_Refresh() end
end

LayoutPages = function()
  local function MakePage()
    local page = CreateFrame("Frame", nil, frame)
    page:SetPoint("TOPLEFT", 0, -96)
    page:SetPoint("BOTTOMRIGHT")
    return page
  end
  local pagePicks = MakePage()
  local pageGroup = MakePage()
  local pageRaid = MakePage()
  frame.pagePicks = pagePicks
  frame.pageGroup = pageGroup
  frame.pageRaid = pageRaid

  frame.tabBar = CreateFrame("Frame", nil, frame)
  frame.tabBar:SetPoint("TOPLEFT", 12, -64)
  frame.tabBar:SetSize(300, 26)
  frame.tabs = {}
  local tabNames = { "picks", "group", "raid" }
  local tabLabels = { picks = "Picks", group = "Group", raid = "Raid" }
  for i, id in ipairs(tabNames) do
    local btn = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
    btn:SetSize(90, 22)
    btn:SetPoint("TOPLEFT", 16 + (i - 1) * 96, -66)
    btn:SetText(tabLabels[id])
    btn:SetScript("OnClick", function() ShowPage(id) end)
    frame.tabs[id] = btn
  end

  for i, btn in ipairs(pickButtons) do
    btn:SetParent(pagePicks)
    btn:ClearAllPoints()
    local col = (i - 1) % 3
    local row = math.floor((i - 1) / 3)
    btn:SetPoint("TOPLEFT", 16 + col * 182, -8 - row * 36)
  end

  frame.bossDrop:SetParent(pagePicks)
  frame.bossDrop:ClearAllPoints()
  frame.bossDrop:SetPoint("TOPLEFT", -4, -84)

  searchBox:SetParent(pagePicks)
  searchBox:ClearAllPoints()
  searchBox:SetPoint("TOPLEFT", 24, -122)
  searchBox:SetWidth(260)

  frame.showAll:SetParent(pagePicks)
  frame.showAll:ClearAllPoints()
  frame.showAll:SetPoint("LEFT", searchBox, "RIGHT", 8, 0)

  frame.itemScroll:SetParent(pagePicks)
  frame.itemScroll:ClearAllPoints()
  frame.itemScroll:SetPoint("TOPLEFT", 12, -154)
  frame.itemScroll:SetPoint("RIGHT", -32, 0)
  frame.itemScroll:SetHeight(ITEM_ROWS * ITEM_ROW_H + 4)
  frame.emptyText:SetParent(pagePicks)
  for _, btn in ipairs(itemButtons) do
    btn:SetParent(pagePicks)
  end

  frame.clearMineBtn:SetParent(pagePicks)
  frame.clearMineBtn:ClearAllPoints()
  frame.clearMineBtn:SetPoint("BOTTOMLEFT", 16, 10)
  frame.submitBtn:SetParent(pagePicks)
  frame.submitBtn:ClearAllPoints()
  frame.submitBtn:SetPoint("BOTTOMRIGHT", -16, 10)
  frame.hint:SetParent(pagePicks)
  frame.hint:ClearAllPoints()
  frame.hint:SetPoint("LEFT", frame.clearMineBtn, "RIGHT", 10, 0)
  frame.hint:SetPoint("RIGHT", frame.submitBtn, "LEFT", -10, 0)

  frame.rosterTitle:SetParent(pageGroup)
  frame.rosterTitle:ClearAllPoints()
  frame.rosterTitle:SetPoint("TOPLEFT", 16, -8)
  frame.rosterPanel:SetParent(pageGroup)
  frame.rosterPanel:ClearAllPoints()
  frame.rosterPanel:SetPoint("TOPLEFT", 16, -28)
  frame.rosterPanel:SetPoint("BOTTOMRIGHT", -16, 46)
  frame.exportBtn:SetParent(pageGroup)
  frame.exportBtn:ClearAllPoints()
  frame.exportBtn:SetPoint("BOTTOMLEFT", 16, 12)

  frame.instLabel:SetParent(pageRaid)
  frame.instLabel:ClearAllPoints()
  frame.instLabel:SetPoint("TOPLEFT", 16, -8)
  frame.instDrop:SetParent(pageRaid)
  frame.instDrop:ClearAllPoints()
  frame.instDrop:SetPoint("TOPLEFT", -4, -24)

  frame.limitBox = CreateFrame("Frame", nil, pageRaid)
  frame.limitBox:SetSize(150, 26)
  frame.limitBox:SetPoint("TOPLEFT", 250, -30)
  frame.minusBtn:SetParent(frame.limitBox)
  frame.minusBtn:ClearAllPoints()
  frame.minusBtn:SetPoint("LEFT", 0, 0)
  frame.limitLabel:SetParent(frame.limitBox)
  frame.limitLabel:ClearAllPoints()
  frame.limitLabel:SetPoint("LEFT", frame.minusBtn, "RIGHT", 6, 0)
  frame.plusBtn:SetParent(frame.limitBox)
  frame.plusBtn:ClearAllPoints()
  frame.plusBtn:SetPoint("LEFT", frame.limitLabel, "RIGHT", 6, 0)

  local function Note(anchor, y, text)
    local fs = pageRaid:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    fs:SetPoint("TOPLEFT", anchor, "BOTTOMLEFT", 0, y)
    fs:SetWidth(520)
    fs:SetJustifyH("LEFT")
    fs:SetText(text)
    fs:SetTextColor(0.7, 0.7, 0.7)
    return fs
  end
  -- The dropdown template has invisible padding on its left, so this note is placed on the page
  -- itself; anchored to the dropdown it stuck out past the window's edge.
  local raidNote = Note(pageRaid, 0, "The raid leader chooses the raid and how many soft reserves each person gets.")
  raidNote:ClearAllPoints()
  raidNote:SetPoint("TOPLEFT", 16, -84)

  frame.shareBtn:SetParent(pageRaid)
  frame.shareBtn:ClearAllPoints()
  frame.shareBtn:SetPoint("TOPLEFT", 16, -108)
  frame.shareBtn:SetSize(250, 24)
  frame.lockBtn:SetParent(pageRaid)
  frame.lockBtn:ClearAllPoints()
  frame.lockBtn:SetPoint("LEFT", frame.shareBtn, "RIGHT", 8, 0)
  frame.lockBtn:SetSize(180, 24)
  Note(frame.shareBtn, -8, "Start the sheet so the raid can pick. Lock it when reserves should stay put.")

  local discordLabel = pageRaid:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  discordLabel:SetPoint("TOPLEFT", 16, -176)
  discordLabel:SetText("Discord invite")
  local discordBox = CreateFrame("EditBox", "RaidNightDiscord", pageRaid, "InputBoxTemplate")
  discordBox:SetSize(300, 20)
  discordBox:SetPoint("TOPLEFT", 24, -194)
  discordBox:SetAutoFocus(false)
  discordBox:SetMaxLetters(120)
  discordBox:SetScript("OnEscapePressed", function(self)
    self:SetText(GroupDiscord() or "")
    self:ClearFocus()
  end)
  discordBox:SetScript("OnEditFocusGained", function(self) self:HighlightText() end)
  discordBox:SetScript("OnEnterPressed", function(self)
    self:ClearFocus()
    if InRaidOrParty() and not IsLead() then
      -- Raiders can copy the link but not change it.
      self:SetText(GroupDiscord() or "")
      return
    end
    local typed = strtrim(self:GetText() or "")
    local link = CleanDiscord(typed)
    if typed ~= "" and not link then
      Print("That is not a Discord invite. It should look like discord.gg/yourcode")
      self:SetText(db.discord or "")
      return
    end
    db.discord = link
    self:SetText(link or "")
    Print(link and ("Discord invite saved: " .. link) or "Discord invite removed.")
    Broadcast(true)
  end)
  frame.discordBox = discordBox
  frame.discordNote = pageRaid:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  frame.discordNote:SetPoint("TOPLEFT", 16, -220)
  frame.discordNote:SetWidth(520)
  frame.discordNote:SetJustifyH("LEFT")
  frame.discordNote:SetTextColor(0.7, 0.7, 0.7)

  local hr = pageRaid:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  hr:SetPoint("TOPLEFT", 16, -252)
  hr:SetText("Hard reserves")
  local hrNote = pageRaid:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  hrNote:SetPoint("TOPLEFT", hr, "BOTTOMLEFT", 0, -4)
  hrNote:SetWidth(520)
  hrNote:SetJustifyH("LEFT")
  hrNote:SetText("On the Picks tab, the raid leader right-clicks an item to hard reserve it. That item comes off everyone else's list.")
  hrNote:SetTextColor(0.7, 0.7, 0.7)

  frame.clearSheetBtn:SetParent(pageRaid)
  frame.clearSheetBtn:ClearAllPoints()
  frame.clearSheetBtn:SetPoint("TOPLEFT", 16, -306)
  Note(frame.clearSheetBtn, -6, "Clears everyone's picks and hard reserves. Only the raid leader can do this.")

  frame.tourBtn:SetParent(pageRaid)
  frame.tourBtn:ClearAllPoints()
  frame.tourBtn:SetPoint("TOPLEFT", 16, -366)

  ShowPage(db and db.page or "picks")
end

function RaidNight_ShowExport()
  BuildUI()
  SetRoster(PlayerName(), playerClass, Picks(), true, db.instanceId)
  local rows = MergedRoster()
  local hardIds = {}
  for _, id in ipairs(ActiveHard()) do hardIds[id] = true end
  local hardOwner = NameKey(PlayerName())
  if InRaidOrParty() and not IsLead() then hardOwner = LeaderKey() end
  local lines = { "ItemId,Name,Class,Note,Plus" }
  local hardOwnerRow
  for _, row in ipairs(rows) do
    if hardOwner and NameKey(row.name) == hardOwner then hardOwnerRow = row end
    for _, id in ipairs(row.picks) do
      if not hardIds[id] then
        tinsert(lines, string.format("%d,%s,%s,,0", id, strlower(row.name), strlower(row.class)))
      end
    end
  end
  -- The box holds only CSV rows, so everything copied from it is valid for Gargul.
  -- The readable hard-reserve summary goes to chat instead.
  local hardLines = {}
  if hardOwnerRow then
    for _, id in ipairs(ActiveHard()) do
      tinsert(lines, string.format("%d,%s,%s,HR,0", id, strlower(hardOwnerRow.name), strlower(hardOwnerRow.class)))
      tinsert(hardLines, (ItemName(id) or ("item " .. id)) .. " (" .. hardOwnerRow.name .. ")")
    end
  end
  local text = table.concat(lines, "\n")
  if not frame.exportBox then
    local template = BackdropTemplateMixin and "BackdropTemplate" or nil
    local box = CreateFrame("Frame", "RaidNightExport", frame, template)
    box:SetSize(420, 240)
    box:SetPoint("CENTER")
    MakeBackdrop(box)
    box:SetBackdropColor(0, 0, 0, 0.95)
    box:SetFrameStrata("FULLSCREEN_DIALOG")
    -- Scrolls, so a full raid's rows stay inside the box.
    local scroll = CreateFrame("ScrollFrame", "RaidNightExportScroll", box, "UIPanelScrollFrameTemplate")
    scroll:SetPoint("TOPLEFT", 10, -10)
    scroll:SetPoint("BOTTOMRIGHT", -30, 36)
    box.scroll = scroll
    local eb = CreateFrame("EditBox", nil, scroll)
    eb:SetMultiLine(true)
    eb:SetFontObject(GameFontHighlightSmall)
    eb:SetWidth(380)
    eb:SetAutoFocus(true)
    scroll:SetScrollChild(eb)
    -- Read-only: typing (or movement keys) puts the export back instead of changing it.
    eb:SetScript("OnTextChanged", function(self, userInput)
      if userInput and box.text then
        self:SetText(box.text)
        self:HighlightText()
      end
    end)
    eb:SetScript("OnEscapePressed", function(self)
      self:ClearFocus()
      box:Hide()
    end)
    box.edit = eb
    local close = CreateFrame("Button", nil, box, "UIPanelButtonTemplate")
    close:SetSize(80, 22)
    close:SetPoint("BOTTOM", 0, 8)
    close:SetText("Close")
    close:SetScript("OnClick", function() box:Hide() end)
    frame.exportBox = box
  end
  frame.exportBox.text = text
  frame.exportBox.edit:SetText(text)
  frame.exportBox:Show()
  frame.exportBox.scroll:SetVerticalScroll(0)
  frame.exportBox.edit:SetFocus()
  frame.exportBox.edit:HighlightText()
  if #hardLines > 0 then
    Print("Hard reserves: " .. table.concat(hardLines, ", "))
    Print("Press Ctrl+C to copy, then /gl sr in Gargul. Hard reserves are the rows marked HR, under the raid leader.")
  else
    Print("Press Ctrl+C to copy, then /gl sr in Gargul.")
  end
end

function RaidNight_Toggle()
  BuildUI()
  if frame:IsShown() then
    frame:Hide()
  else
    if InRaidOrParty() then
      Send("Q")
      Broadcast()
    end
    frame:Show()
    RaidNight_Refresh()
  end
end

local function OnAddonMessage(prefix, message, _, sender)
  prefix, message, sender = Plain(prefix), Plain(message), Plain(sender)
  if prefix ~= PREFIX then return end
  if not sender or type(message) ~= "string" then return end
  local kind, a, b, c = strsplit(":", message, 4)
  local fromSelf = NameKey(sender) == NameKey(PlayerName())
  -- Our own Q/R/C come back to us; our local state is already up to date.
  if fromSelf and (kind == "Q" or kind == "R" or kind == "C" or kind == "H" or kind == "D") then return end
  if (kind == "R" or kind == "C" or kind == "H" or kind == "D") then
    -- Sheet settings, hard reserves, and clears are only accepted from the current group leader.
    local leader = LeaderKey()
    if leader == nil then
      RequestSync(2) -- roster not loaded yet; ask again shortly
      return
    end
    if leader ~= NameKey(sender) then return end
  end
  if kind == "P" then
    if db.locked then
      local prev = roster[NameKey(sender)]
      if prev and prev.hasAddon then return end
    end
    local picks = {}
    if b and b ~= "" then
      for id in string.gmatch(b, "%d+") do
        if #picks >= 6 then break end
        local n = tonumber(id)
        if n and n > 0 and n < 100000000 then tinsert(picks, n) end
      end
    end
    -- c = raid id the picks belong to (nil from 1.3.4 and older)
    local instance = nil
    if c and c ~= "" then
      if not IsKnownInstance(c) then return end
      instance = c
    end
    SetRoster(sender, a or "WARRIOR", picks, true, instance)
    if frame and frame:IsShown() then RaidNight_Refresh() end
  elseif kind == "R" and a then
    if not IsKnownInstance(a) then return end
    local limit = tonumber(b)
    if not limit then return end
    local prevInstance = db.instanceId
    local prevLimit = db.pickLimit
    local wasLocked = db.locked
    local heard = sessionSheet
    db.shared = true
    sessionSheet = true
    if sheetOpenedAt == 0 then sheetOpenedAt = GetTime and GetTime() or 0 end
    db.instanceId = a
    db.pickLimit = math.max(1, math.min(6, math.floor(limit)))
    db.locked = c == "1"
    -- Drop picks beyond the lead's limit so they are not shared or exported.
    local picks = Picks()
    local trimmed = false
    while #picks > db.pickLimit do
      tremove(picks)
      trimmed = true
    end
    if prevInstance ~= a then
      -- New raid: the old boss filter would match nothing, so start on all bosses at the top.
      ResetBossFilter()
      ResetItemScroll()
    end
    local currentHard = CurrentRemoteHard()
    if currentHard and not IsLead() then
      local names = TakeHardReservedPicks(currentHard)
      if #names > 0 then
        Print("The raid leader hard reserved " .. table.concat(names, ", ") .. ", so that came off your list.")
        trimmed = true
      end
    end
    if db.locked and not wasLocked then
      Print("SRs are locked. Picks cannot be changed.")
    elseif wasLocked and not db.locked then
      Print("SRs are unlocked. You can change picks again.")
    elseif not heard or prevInstance ~= a or prevLimit ~= db.pickLimit then
      Print(sender .. " started the " .. InstanceName(a) .. " sheet (" .. db.pickLimit .. " each). Type /rn to pick.")
    end
    -- Resend our picks for the lead's raid so the sheet never holds picks for another raid.
    if trimmed or prevInstance ~= a then Broadcast(true) end
    if frame and frame:IsShown() then RaidNight_Refresh() end
  elseif kind == "H" and a then
    if not IsKnownInstance(a) then return end
    local raw = {}
    if b and b ~= "" then
      for id in string.gmatch(b, "%d+") do tinsert(raw, tonumber(id)) end
    end
    local ids = CleanIdList(raw, HARD_LIMIT)
    remoteHard = ids
    remoteHardInstance = a
    remoteHardFrom = NameKey(sender)
    if a == db.instanceId and not IsLead() then
      local names = TakeHardReservedPicks(ids)
      if #names > 0 then
        Print("The raid leader hard reserved " .. table.concat(names, ", ") .. ", so that came off your list.")
        Broadcast(true)
      end
    end
    if frame and frame:IsShown() then RaidNight_Refresh() end
  elseif kind == "D" then
    -- The link has colons in it, so take everything after "D:" rather than the split fields.
    local link = CleanDiscord(strsub(message, 3))
    if link ~= db.groupDiscord then
      db.groupDiscord = link
      if link then Print("Raid Discord: " .. link .. "  (copy it from /rn, Raid tab)") end
    end
    if frame and frame:IsShown() then RaidNight_Refresh() end
  elseif kind == "Q" then
    Broadcast()
  elseif kind == "C" then
    db.picks = {}
    ClearRemoteHard()
    db.locked = false
    wipe(roster)
    SetRoster(PlayerName(), playerClass, Picks(), true, db.instanceId)
    -- The lead just sent this, so they have the addon; their fresh picks follow.
    SetRoster(sender, nil, {}, true, db.instanceId)
    -- Tell the group we still have the addon, so nobody shows as "needs addon".
    Broadcast(true)
    Print("The lead cleared the Raid Night sheet.")
    snoozeUntil = 0
    nudgedKey = nil
    if frame and frame:IsShown() then RaidNight_Refresh() end
  end
  if UpdateHelper then UpdateHelper() end
end

local eventFrame = CreateFrame("Frame")
eventFrame:RegisterEvent("ADDON_LOADED")
eventFrame:RegisterEvent("PLAYER_LOGIN")
eventFrame:RegisterEvent("CHAT_MSG_ADDON")
pcall(eventFrame.RegisterEvent, eventFrame, "RAID_ROSTER_UPDATE")
pcall(eventFrame.RegisterEvent, eventFrame, "PARTY_MEMBERS_CHANGED")
pcall(eventFrame.RegisterEvent, eventFrame, "GROUP_ROSTER_UPDATE")
eventFrame:RegisterEvent("PLAYER_REGEN_ENABLED")
pcall(eventFrame.RegisterEvent, eventFrame, "ENCOUNTER_END")
pcall(eventFrame.RegisterEvent, eventFrame, "GET_ITEM_INFO_RECEIVED")
eventFrame:SetScript("OnEvent", function(_, event, arg1, arg2, arg3, arg4)
  if event == "ADDON_LOADED" and arg1 == "RaidNight" then
    RaidNightDB = RaidNightDB or {}
    db = RaidNightDB
    if not IsKnownInstance(db.instanceId) then db.instanceId = DEFAULT_INSTANCE end
    db.pickLimit = math.max(1, math.min(6, math.floor(tonumber(db.pickLimit) or 2)))
    if type(db.picks) ~= "table" then db.picks = {} end
    for id in pairs(db.picks) do
      if not IsKnownInstance(id) then db.picks[id] = nil end
    end
    db.showAll = db.showAll or false
    if db.sound == nil then db.sound = true end
    db.locked = db.locked or false
    -- Bump when the walkthrough gains steps, so people who finished an older one see it once more.
    if (db.tourVersion or 1) < 2 then
      db.tourDone = false
      db.tourVersion = 2
    end
    db.discord = CleanDiscord(db.discord)
    db.groupDiscord = CleanDiscord(db.groupDiscord)
    if type(db.hard) ~= "table" then db.hard = {} end
    local keptHard = {}
    for id, list in pairs(db.hard) do
      if IsKnownInstance(id) then keptHard[id] = CleanIdList(list, HARD_LIMIT) end
    end
    db.hard = keptHard
    if C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix then
      C_ChatInfo.RegisterAddonMessagePrefix(PREFIX)
    elseif RegisterAddonMessagePrefix then
      RegisterAddonMessagePrefix(PREFIX)
    end
  elseif event == "PLAYER_LOGIN" then
    if SetupMinimapButton then SetupMinimapButton() end
    playerClass = ClassFile()
    SetRoster(PlayerName(), playerClass, Picks(), true, db.instanceId)
    wasGrouped = InRaidOrParty()
    groupSignature = GroupSignature()
    if wasGrouped then
      -- Still in the same group (e.g. /reload): keep the lock and sheet state.
      Send("Q")
      Broadcast(true)
    else
      -- Logged in solo: last group's lock and sheet no longer apply (confirmed after a short delay).
      ResetIfStillSolo()
    end
    if C_Timer and C_Timer.After then
      C_Timer.After(2, function()
        if UpdateHelper then UpdateHelper() end
      end)
    elseif UpdateHelper then
      UpdateHelper()
    end
  elseif event == "PLAYER_REGEN_ENABLED" then
    quietHelperUntil = (GetTime and GetTime() or 0) + 2
    if db then FlushHeld() end
  elseif event == "ENCOUNTER_END" then
    -- Boss fight over: send anything held back (retries if the game is still locked).
    if db then FlushHeld() end
  elseif event == "GET_ITEM_INFO_RECEIVED" then
    -- An item name we asked for has loaded; redraw once shortly after.
    if db and frame and frame:IsShown() and not itemRefreshPending then
      itemRefreshPending = true
      if C_Timer and C_Timer.After then
        C_Timer.After(0.2, function()
          itemRefreshPending = false
          if frame and frame:IsShown() then RaidNight_Refresh() end
        end)
      else
        itemRefreshPending = false
        RaidNight_Refresh()
      end
    end
  elseif event == "CHAT_MSG_ADDON" then
    if db then OnAddonMessage(arg1, arg2, arg3, arg4) end
  elseif event == "RAID_ROSTER_UPDATE" or event == "PARTY_MEMBERS_CHANGED" or event == "GROUP_ROSTER_UPDATE" then
    if not db then return end
    local grouped = InRaidOrParty()
    if wasGrouped and not grouped then
      -- Left the group: the old lock and sheet no longer apply (confirmed after a short delay).
      ResetIfStillSolo()
    elseif grouped and not wasGrouped then
      -- Just joined: ask everyone for their state once the roster has loaded.
      RequestSync(2)
    end
    wasGrouped = grouped
    if frame and frame:IsShown() then
      RaidNight_Refresh()
    elseif UpdateHelper then
      UpdateHelper()
    end
    -- Only resend when members or the leader actually changed, not on every roster event.
    local sig = GroupSignature()
    if sig ~= groupSignature then
      groupSignature = sig
      if grouped then Broadcast() end
    end
  end
end)

local SNOOZE_SECONDS = 600
local WISP_SIZE = 96            -- 32x32 pixel-art sprite shown at 3x
local WISP_PIXEL = WISP_SIZE / 32
local WISP_FLAME_FRAMES = 16   -- WispBody.tga: 4x4 grid (a 4-step flame loop, repeated)
local WISP_FLAME_FPS = 4       -- choppy on purpose, like a 2000s virtual pet
local WISP_BOB = { 0, 1, 0, -1 }  -- 1-pixel idle bounce, in step with the flame
local FACE_OPEN, FACE_HALF, FACE_CLOSED, FACE_HAPPY = 0, 1, 2, 3   -- WispFace.tga: 4x1

-- Shows one cell of a sprite-sheet texture.
local function SetSheetFrame(tex, index, cols, rows)
  local c = index % cols
  local r = math.floor(index / cols)
  tex:SetTexCoord(c / cols, (c + 1) / cols, r / rows, (r + 1) / rows)
end
local WISP_SOUND = "Interface\\AddOns\\RaidNight\\Wisp.ogg"
local CHIME_COOLDOWN = 20
local lastChime = -CHIME_COOLDOWN

-- Soft chime when the wisp pops up with something new. Muted with /rn sound,
-- never plays in combat, and at most once every CHIME_COOLDOWN seconds.
local function PlayWispChime(force)
  if not db or not db.sound then return end
  if not force then
    if InCombatLockdown and InCombatLockdown() then return end
    local now = GetTime and GetTime() or 0
    if now - lastChime < CHIME_COOLDOWN then return end
    lastChime = now
  end
  -- Play the wisp's own chime; if this game version can't play addon sound files,
  -- fall back to WoW's built-in whisper "ding".
  local played = false
  if PlaySoundFile then
    local ok, willPlay = pcall(PlaySoundFile, WISP_SOUND, "Master")
    played = ok and willPlay ~= false
  end
  if not played and PlaySound and SOUNDKIT and SOUNDKIT.TELL_MESSAGE then
    pcall(PlaySound, SOUNDKIT.TELL_MESSAGE, "Master")
  end
end

local function DisplayName(name)
  return (strmatch(name or "", "^([^-]+)")) or (name or "")
end

local function JoinNames(list)
  if #list == 0 then return "" end
  if #list > 4 then
    return list[1] .. ", " .. list[2] .. ", " .. list[3] .. ", and " .. (#list - 3) .. " more"
  end
  if #list == 1 then return list[1] end
  if #list == 2 then return list[1] .. " and " .. list[2] end
  local head = {}
  for i = 1, #list - 1 do tinsert(head, list[i]) end
  return table.concat(head, ", ") .. ", and " .. list[#list]
end

local function RosterGaps()
  local waiting, noAddon = {}, {}
  for _, row in ipairs(MergedRoster()) do
    if not row.you then
      local shown = DisplayName(row.name)
      if not row.hasAddon then
        tinsert(noAddon, shown)
      elseif #(row.picks or {}) < (db.pickLimit or 1) then
        tinsert(waiting, shown)
      end
    end
  end
  return waiting, noAddon
end

local function OpenSheet()
  BuildUI()
  if not frame:IsShown() then frame:Show() end
  RaidNight_Refresh()
end

-- Names from a list, showing at most `shown` of them before "and N more".
local function JoinSomeNames(list, shown)
  if #list <= shown then return JoinNames(list) end
  if shown == 0 then return #list .. (#list == 1 and " player" or " players") end
  local head = {}
  for i = 1, shown do tinsert(head, list[i]) end
  return table.concat(head, ", ") .. ", and " .. (#list - shown) .. " more"
end

local function RemindRaiders(waiting, noAddon)
  -- Shorten by showing fewer whole names, never by cutting bytes: cutting could split
  -- an accented letter and the game would refuse the message.
  local msg
  for shown = 4, 0, -1 do
    msg = "Raid Night:"
    if #waiting > 0 then
      msg = msg .. " still need SRs from " .. JoinSomeNames(waiting, shown) .. "."
    end
    if #noAddon > 0 then
      msg = msg .. " " .. JoinSomeNames(noAddon, shown) .. " need the addon."
    end
    msg = msg .. " Type /rn."
    if #msg <= 240 then break end
  end
  Announce(msg)
  Print("Reminder sent in chat.")
end

local function TipKind(key)
  return key and strmatch(key, "^[^:]+") or ""
end

local function SheetSettled()
  if sheetOpenedAt == 0 then return true end
  return (GetTime and GetTime() or 0) - sheetOpenedAt >= 8
end

local function HelperTip()
  if not db or not InRaidOrParty() then return nil end
  local lead = IsLead()
  local limit = db.pickLimit or 2
  local filled = #Picks()
  local open = sessionSheet or (lead and db.shared)
  if not open then
    if not lead then return nil end
    -- Only nudge raid leaders; 5-man parties and battlegrounds don't need a loot sheet.
    if RaidCount() == 0 then return nil end
    if IsInInstance then
      local _, instanceType = IsInInstance()
      if instanceType == "pvp" or instanceType == "arena" then return nil end
    end
    return {
      key = "send",
      text = "Send the list out. The raid can't put SRs in until you start the sheet.",
      button = "Start sheet",
      click = ShareSheet,
    }
  end
  if not db.locked and filled < limit then
    return {
      key = "sr:" .. filled .. ":" .. limit,
      text = "Put your soft reserves in. " .. filled .. " of " .. limit .. " filled.",
      button = "Open sheet",
      click = OpenSheet,
    }
  end
  if not db.locked and db.submitted ~= SubmittedKey() then
    return {
      key = "submit:" .. SubmittedKey(),
      text = "All " .. limit .. " picked. Hit Submit so you know they're in.",
      button = "Submit",
      click = SubmitPicks,
    }
  end
  if lead and not db.locked then
    if not SheetSettled() then return nil end
    local waiting, noAddon = RosterGaps()
    local key = "remind:" .. table.concat(waiting, ",") .. "|" .. table.concat(noAddon, ",")
    local gaps = #waiting > 0 or #noAddon > 0
    if gaps and nudgedKey ~= key then
      local bits = {}
      if #waiting > 0 then tinsert(bits, "Still need SRs from " .. JoinNames(waiting) .. ".") end
      if #noAddon > 0 then tinsert(bits, JoinNames(noAddon) .. " still need the addon.") end
      return {
        key = key,
        text = table.concat(bits, " "),
        button = "Remind them",
        click = function()
          RemindRaiders(waiting, noAddon)
          nudgedKey = key
          UpdateHelper()
        end,
      }
    end
    local text = gaps
      and "Still missing a few. Lock the list when you don't want more changes."
      or "Reserves are in. Lock the list so nobody changes a pick."
    return {
      key = gaps and "lock:wait" or "lock:ready",
      text = text,
      button = "Lock SRs",
      click = function() SetLocked(true, true) end,
    }
  end
  if db.locked and filled < limit then
    if lead then
      return {
        key = "locked-short:" .. filled,
        text = "The list is locked and you're still short a reserve. Unlock it if you need to change picks.",
        button = "Unlock SRs",
        click = function() SetLocked(false, true) end,
      }
    end
    return {
      key = "locked-short:" .. filled,
      text = "The list is locked and you're still short a reserve. Ask the lead if it needs to open again.",
      button = "Open sheet",
      click = OpenSheet,
    }
  end
  return nil
end

local function HelperLater()
  snoozeUntil = (GetTime and GetTime() or 0) + SNOOZE_SECONDS
  if helper then helper:Hide() end
end

local function RestoreLater()
  if not helper or not helper.later then return end
  helper.later:SetText("Later")
  helper.later:SetScript("OnClick", HelperLater)
end

local function EnsureHelper()
  if helper then return end
  local template = BackdropTemplateMixin and "BackdropTemplate" or nil
  helper = CreateFrame("Frame", "RaidNightHelper", UIParent, template)
  helper:SetSize(400, 124)
  helper:SetFrameStrata("DIALOG")
  helper:SetClampedToScreen(true)
  helper:EnableMouse(true)
  helper:SetMovable(true)
  helper:RegisterForDrag("LeftButton")
  helper:SetScript("OnDragStart", function(self) self:StartMoving() end)
  helper:SetScript("OnDragStop", function(self) self:StopMovingOrSizing() end)
  MakeBackdrop(helper)
  helper:SetBackdropColor(0.04, 0.06, 0.09, 0.96)
  helper:SetBackdropBorderColor(0.89, 0.71, 0.34, 0.9)
  helper:Hide()

  -- Invisible lane on the left of the panel that the wisp flies around in.
  local holder = CreateFrame("Frame", nil, helper)
  holder:SetSize(140, 116)
  holder:SetPoint("LEFT", 4, 0)
  helper.holder = holder

  -- Animated wisp: body/flame frames plus a face layer on top (blinks, smiles).
  local portrait = holder:CreateTexture(nil, "ARTWORK")
  portrait:SetSize(WISP_SIZE, WISP_SIZE)
  portrait:SetPoint("CENTER")
  -- "NEAREST" keeps the pixel art crisp instead of blurring it.
  portrait:SetTexture("Interface\\AddOns\\RaidNight\\WispBody.tga", nil, nil, "NEAREST")
  local face = holder:CreateTexture(nil, "OVERLAY")
  face:SetSize(WISP_SIZE, WISP_SIZE)
  face:SetPoint("CENTER")
  face:SetTexture("Interface\\AddOns\\RaidNight\\WispFace.tga", nil, nil, "NEAREST")
  if portrait:GetTexture() and face:GetTexture() then
    helper.animated = true
    SetSheetFrame(portrait, 0, 4, 4)
    SetSheetFrame(face, FACE_OPEN, 4, 1)
  else
    -- Sheets missing (e.g. files added without restarting WoW): use the still picture.
    helper.animated = false
    face:Hide()
    if not portrait:SetTexture("Interface\\AddOns\\RaidNight\\Helper.tga") or not portrait:GetTexture() then
      portrait:SetTexture("Interface\\Icons\\Spell_Nature_WispSplode")
    end
  end
  helper.portrait = portrait
  helper.face = face

  helper.text = helper:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  helper.text:SetPoint("TOPLEFT", 150, -14)
  helper.text:SetWidth(234)
  helper.text:SetJustifyH("LEFT")
  helper.text:SetJustifyV("TOP")
  helper.text:SetWordWrap(true)
  helper.text:SetSpacing(2)
  helper.text:SetTextColor(0.95, 0.91, 0.8)

  helper.action = CreateFrame("Button", nil, helper, "UIPanelButtonTemplate")
  helper.action:SetSize(124, 22)
  helper.action:SetPoint("BOTTOMLEFT", 150, 12)

  helper.later = CreateFrame("Button", nil, helper, "UIPanelButtonTemplate")
  helper.later:SetSize(72, 22)
  helper.later:SetPoint("LEFT", helper.action, "RIGHT", 6, 0)
  helper.later:SetText("Later")
  helper.later:SetScript("OnClick", HelperLater)

  helper.bob = 0
  helper:SetScript("OnUpdate", function(self, elapsed)
    self.bob = self.bob + elapsed
    local t = self.bob
    if self.portrait then
      -- Fly around the lane: layered waves give a lively, never-repeating path.
      local x = 2 + 20 * math.sin(t * 1.3) + 8 * math.sin(t * 2.9 + 1.1)
      local y = 9 + 12 * math.sin(t * 1.7 + 0.4) + 6 * math.sin(t * 3.4 + 2.0) + 3 * math.sin(t * 5.3)
      -- Happy hop when a new tip appears.
      if self.slide and self.slide > 0 then
        y = y + math.sin((1 - self.slide) * math.pi) * 16
      end
      local step = math.floor(t * WISP_FLAME_FPS) % WISP_FLAME_FRAMES
      if self.animated then
        -- Chunky 1-pixel idle bounce in time with the flame.
        y = y + WISP_BOB[(step % 4) + 1] * WISP_PIXEL
      end
      -- Whole pixels only, so the pixel art never shimmers between screen pixels.
      x = math.floor(x + 0.5)
      y = math.floor(y + 0.5)
      local w, h = WISP_SIZE, WISP_SIZE
      self.portrait:ClearAllPoints()
      self.portrait:SetPoint("CENTER", self.holder, "CENTER", x, y)
      self.portrait:SetSize(w, h)
      if self.animated then
        SetSheetFrame(self.portrait, step, 4, 4)
        -- Face: happy right after a new tip, otherwise open with a quick blink every few seconds.
        local faceFrame = FACE_OPEN
        if self.happyUntil and t < self.happyUntil then
          faceFrame = FACE_HAPPY
        else
          self.nextBlink = self.nextBlink or (t + 2 + math.random() * 3)
          if t >= self.nextBlink then
            local b = t - self.nextBlink
            if b < 0.06 then
              faceFrame = FACE_HALF
            elseif b < 0.14 then
              faceFrame = FACE_CLOSED
            elseif b < 0.20 then
              faceFrame = FACE_HALF
            else
              self.nextBlink = t + 2.5 + math.random() * 3.5
            end
          end
        end
        SetSheetFrame(self.face, faceFrame, 4, 1)
        self.face:ClearAllPoints()
        self.face:SetPoint("CENTER", self.holder, "CENTER", x, y)
        self.face:SetSize(w, h)
      end
    end
    if self.slide and self.slide > 0 then
      self.slide = math.max(0, self.slide - elapsed * 3)
      self:SetAlpha(1 - self.slide)
    end
  end)
end

local function ApplyHelperText(text)
  helper.text:SetText(text)
  local textH = helper.text:GetStringHeight() or 36
  if textH < 28 then textH = 28 end
  if textH > 96 then textH = 96 end
  helper.text:SetHeight(textH)
  helper:SetHeight(math.max(116, textH + 70))
end

local function PlaceHelper()
  if tourRunning then return end
  if helper then helper:SetFrameStrata("DIALOG") end
  local docked = frame and frame:IsShown() and true or false
  if helper.docked == docked then return end
  helper.docked = docked
  helper:ClearAllPoints()
  if docked then
    helper:SetPoint("TOPLEFT", frame, "TOPRIGHT", 8, -4)
  else
    helper:SetPoint("BOTTOMRIGHT", UIParent, "BOTTOMRIGHT", -48, 260)
  end
end

local function Highlight(target)
  if not tourGlow then
    local template = BackdropTemplateMixin and "BackdropTemplate" or nil
    tourGlow = CreateFrame("Frame", nil, UIParent, template)
    tourGlow:SetFrameStrata("FULLSCREEN_DIALOG")
    tourGlow:SetFrameLevel(10)
    MakeBackdrop(tourGlow)
    tourGlow:SetBackdropColor(0.89, 0.71, 0.34, 0.16)
    tourGlow:SetBackdropBorderColor(0.95, 0.78, 0.35, 1)
  end
  tourGlow:ClearAllPoints()
  if not target then
    tourGlow:Hide()
    return
  end
  tourGlow:SetPoint("TOPLEFT", target, "TOPLEFT", -6, 6)
  tourGlow:SetPoint("BOTTOMRIGHT", target, "BOTTOMRIGHT", 6, -6)
  tourGlow:Show()
end

-- Sit just outside the window, lined up with the control being explained.
local function DockBeside(target)
  helper:ClearAllPoints()
  helper:SetFrameStrata("FULLSCREEN_DIALOG")
  helper:SetFrameLevel(40)
  if not target or not frame or not frame:IsShown() then
    helper:SetPoint("TOPLEFT", frame, "TOPRIGHT", 8, -4)
    return
  end
  local _, ty = target:GetCenter()
  local _, fy = frame:GetCenter()
  if not ty or not fy then
    helper:SetPoint("TOPLEFT", frame, "TOPRIGHT", 8, -4)
    return
  end
  local helperH = helper:GetHeight() or 124
  local frameH = frame:GetHeight() or 700
  local offset = (ty + helperH / 2) - (fy + frameH / 2)
  helper:SetPoint("TOPLEFT", frame, "TOPRIGHT", 8, offset)
end

local function TourSteps()
  local lead = IsLead()
  return {
    {
      page = "picks",
      target = function() return frame.tabBar end,
      text = "Three tabs. Picks is where you reserve. Group is everyone's list. Raid is where the leader runs the sheet.",
    },
    {
      page = "raid",
      target = function() return frame.instDrop end,
      text = "Choose the raid here. Everyone follows the raid leader's choice.",
    },
    {
      page = "raid",
      target = function() return frame.limitBox end,
      text = lead and "Set how many soft reserves each person gets." or "The raid leader sets how many soft reserves each person gets.",
    },
    {
      page = "raid",
      target = function() return frame.shareBtn end,
      text = lead and "Start the sheet when the raid should pick. That posts it in chat." or "The raid leader starts the sheet. After that, you can put reserves in.",
    },
    {
      page = "raid",
      target = function() return frame.lockBtn end,
      text = lead and "Lock the list when picks should stay put. Unlock it if someone still needs a change." or "When the raid leader locks the list, nobody can change a pick.",
    },
    {
      page = "raid",
      target = function() return frame.discordBox end,
      text = lead and "Paste your raid's Discord invite here and press Enter. The raid sees it here, and it goes in raid chat when you start the sheet." or "The raid leader's Discord invite shows up here. Click it, press Ctrl+C, and paste it into your browser.",
    },
    {
      page = "raid",
      target = function() return frame.clearSheetBtn end,
      text = lead and "Clear sheet wipes everyone's picks and hard reserves. Only you can do that." or "Only the raid leader can clear the sheet for the whole raid.",
    },
    {
      page = "picks",
      target = function() return pickButtons[1] end,
      text = "Your reserves land in these slots. Click a slot to drop that pick.",
    },
    {
      page = "picks",
      target = function() return frame.bossDrop end,
      text = "Filter the list by boss. Trash drops, gems and recipes are at the bottom, under Trash and Recipes.",
    },
    {
      page = "picks",
      target = function() return searchBox end,
      text = "Search by name. Shift-click an item link into this box, or type an item ID.",
    },
    {
      page = "picks",
      target = function() return frame.showAll end,
      text = "The list shows what your class can use. Tick this to see every item in the raid.",
    },
    {
      page = "picks",
      target = function() return frame.itemScroll end,
      text = lead and "Click an item to soft reserve it. Right-click to hard reserve it. Only the raid leader can hard reserve." or "Click an item to soft reserve it. Only the raid leader can hard reserve, with a right-click.",
    },
    {
      page = "picks",
      target = function() return frame.submitBtn end,
      text = "Picks are saved and sent as you click. When you're done, hit Submit reserves. It turns green so you know they're in.",
    },
    {
      page = "picks",
      target = function() return frame.clearMineBtn end,
      text = "Clear my picks removes only your soft reserves. It does not clear the raid.",
    },
    {
      page = "group",
      target = function() return frame.rosterPanel end,
      text = "Group picks shows who the lead is and what each person reserved.",
    },
    {
      page = "group",
      target = function() return frame.exportBtn end,
      text = "Gargul CSV copies the sheet. Paste it into Gargul with /gl sr when loot starts.",
    },
    {
      page = "picks",
      -- Named global: the button is built after this list is written.
      target = function()
        local btn = _G.RaidNightMinimapButton
        return btn and btn:IsShown() and btn or nil
      end,
      text = "This button on your minimap opens Raid Night any time. Drag it to move it, or type /rn minimap to hide it.",
    },
  }
end

local function FinishTour()
  tourRunning = false
  tourToken = tourToken + 1
  if db then db.tourDone = true end
  if tourGlow then tourGlow:Hide() end
  if ShowPage then ShowPage("picks") end
  if not helper then return end
  RestoreLater()
  helper:SetFrameStrata("DIALOG")
  helper.docked = nil
  helper.key = "tour-done"
  ApplyHelperText("That's the sheet. I'll sit back over here.")
  helper.action:SetText("Okay")
  helper.action:SetScript("OnClick", function()
    if UpdateHelper then UpdateHelper() end
  end)
  helper.happyUntil = (helper.bob or 0) + 1.2
  helper.slide = 1
  helper:SetAlpha(0)
  PlaceHelper()
  helper:Show()
  PlayWispChime()
  local token = tourToken
  if C_Timer and C_Timer.After then
    C_Timer.After(4, function()
      if token == tourToken and not tourRunning and UpdateHelper then UpdateHelper() end
    end)
  end
end

local function AdvanceTour()
  if not tourRunning then return end
  tourToken = tourToken + 1
  local token = tourToken
  local steps = TourSteps()
  tourIndex = tourIndex + 1
  if tourIndex > #steps then
    FinishTour()
    return
  end
  local step = steps[tourIndex]
  if ShowPage then ShowPage(step.page) end
  EnsureHelper()
  local target = step.target and step.target() or nil
  Highlight(target)
  ApplyHelperText(step.text .. "   " .. tourIndex .. " / " .. #steps)
  helper.action:SetText(tourIndex == #steps and "Done" or "Next")
  helper.action:SetScript("OnClick", AdvanceTour)
  helper.later:SetText("Skip")
  helper.later:SetScript("OnClick", function()
    tourRunning = false
    tourToken = tourToken + 1
    if db then db.tourDone = true end
    if tourGlow then tourGlow:Hide() end
    if ShowPage then ShowPage("picks") end
    RestoreLater()
    if helper then
      helper:SetFrameStrata("DIALOG")
      helper.docked = nil
    end
    PlaceHelper()
    if UpdateHelper then UpdateHelper() end
  end)
  helper.slide = 1
  helper:SetAlpha(0)
  helper.happyUntil = (helper.bob or 0) + 0.8
  helper.key = "tour"
  DockBeside(target)
  helper.docked = nil
  helper:Show()
  if tourIndex == 1 then PlayWispChime() end
  if C_Timer and C_Timer.After then
    C_Timer.After(0, function()
      if tourRunning and token == tourToken and helper then
        ApplyHelperText(step.text .. "   " .. tourIndex .. " / " .. #steps)
        DockBeside(target)
      end
    end)
    C_Timer.After(5, function()
      if tourRunning and token == tourToken then AdvanceTour() end
    end)
  end
end

StartTour = function(replay)
  BuildUI()
  if replay then
    tourToken = tourToken + 1
    tourRunning = false
    if db then db.tourDone = false end
  end
  if tourRunning then return end
  tourRunning = true
  tourIndex = 0
  if frame and not frame:IsShown() then
    frame:Show()
  end
  AdvanceTour()
end

PauseTour = function()
  if not tourRunning then return end
  tourToken = tourToken + 1
  tourRunning = false
  tourIndex = 0
  if tourGlow then tourGlow:Hide() end
  if helper then
    helper:SetFrameStrata("DIALOG")
    helper.docked = nil
    RestoreLater()
  end
end

UpdateHelper = function()
  if tourRunning then return end
  if not db then return end
  local now = GetTime and GetTime() or 0
  if now < snoozeUntil then
    if helper then helper:Hide() end
    return
  end
  if not forceHelper and now < quietHelperUntil and not (helper and helper:IsShown()) then
    return
  end
  local tip = HelperTip()
  if not tip then
    if helper then helper:Hide() end
    return
  end
  EnsureHelper()
  RestoreLater()
  PlaceHelper()
  local wasShown = helper:IsShown()
  local newKind = TipKind(helper.key) ~= TipKind(tip.key)
  if newKind then
    helper.slide = 1
    helper:SetAlpha(0)
    helper.happyUntil = (helper.bob or 0) + 0.9
  end
  helper.key = tip.key
  ApplyHelperText(tip.text)
  helper.action:SetText(tip.button)
  helper.action:SetScript("OnClick", tip.click)
  helper:Show()
  if newKind or not wasShown then PlayWispChime() end
end

-- A round button on the minimap edge. Left-click opens the sheet, drag moves it around the rim,
-- and /rn minimap hides or shows it. Built by hand so the addon needs no libraries.
local minimapButton

local function PlaceMinimapButton()
  local angle = math.rad(db.minimapAngle or 210)
  local radius = (Minimap:GetWidth() / 2) + 8
  minimapButton:ClearAllPoints()
  minimapButton:SetPoint("CENTER", Minimap, "CENTER", math.cos(angle) * radius, math.sin(angle) * radius)
end

local function FollowCursor()
  local mx, my = Minimap:GetCenter()
  local cx, cy = GetCursorPosition()
  local scale = Minimap:GetEffectiveScale()
  db.minimapAngle = math.deg(math.atan2(cy / scale - my, cx / scale - mx))
  PlaceMinimapButton()
end

SetupMinimapButton = function()
  if not db or not Minimap then return end
  if not minimapButton then
    local btn = CreateFrame("Button", "RaidNightMinimapButton", Minimap)
    btn:SetSize(31, 31)
    btn:SetFrameStrata("MEDIUM")
    btn:SetFrameLevel(8)
    btn:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")
    local back = btn:CreateTexture(nil, "BACKGROUND")
    back:SetTexture("Interface\\Minimap\\UI-Minimap-Background")
    back:SetSize(20, 20)
    back:SetPoint("TOPLEFT", 7, -5)
    local icon = btn:CreateTexture(nil, "ARTWORK")
    icon:SetSize(20, 20)
    icon:SetPoint("TOPLEFT", 7, -5)
    if not icon:SetTexture("Interface\\AddOns\\RaidNight\\Helper.tga") or not icon:GetTexture() then
      icon:SetTexture("Interface\\Icons\\Spell_Nature_WispSplode")
    end
    icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    local border = btn:CreateTexture(nil, "OVERLAY")
    border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
    border:SetSize(53, 53)
    border:SetPoint("TOPLEFT")
    btn:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    btn:RegisterForDrag("LeftButton")
    btn:SetScript("OnClick", function(_, button)
      if button == "RightButton" then
        BuildUI()
        if not frame:IsShown() then RaidNight_Toggle() end
        ShowPage("raid")
      else
        RaidNight_Toggle()
      end
    end)
    btn:SetScript("OnDragStart", function(self)
      GameTooltip:Hide()
      self:SetScript("OnUpdate", FollowCursor)
    end)
    btn:SetScript("OnDragStop", function(self) self:SetScript("OnUpdate", nil) end)
    btn:SetScript("OnEnter", function(self)
      GameTooltip:SetOwner(self, "ANCHOR_LEFT")
      GameTooltip:AddLine("Raid Night")
      GameTooltip:AddLine("Left-click: open your soft reserves", 1, 1, 1)
      GameTooltip:AddLine("Right-click: raid leader settings", 1, 1, 1)
      GameTooltip:AddLine("Drag: move this button", 0.7, 0.7, 0.7)
      GameTooltip:Show()
    end)
    btn:SetScript("OnLeave", function() GameTooltip:Hide() end)
    minimapButton = btn
  end
  PlaceMinimapButton()
  minimapButton:SetShown(not db.minimapHidden)
end

SLASH_RAIDNIGHT1 = "/rn"
SLASH_RAIDNIGHT2 = "/raidnight"
SlashCmdList.RAIDNIGHT = function(msg)
  local typed = strtrim(msg or "")
  msg = strlower(typed)
  if msg == "discord" or strsub(msg, 1, 8) == "discord " then
    -- Invite codes are case-sensitive, so read the link from what was typed, not the lowercased copy.
    local arg = strtrim(strsub(typed, 9))
    if arg == "" then
      local link = GroupDiscord()
      Print(link and ("Raid Discord: " .. link) or "No Discord invite set. The leader adds one with /rn discord discord.gg/yourcode")
      return
    end
    if InRaidOrParty() and not IsLead() then
      Print("Only the party/raid leader can set the Discord invite.")
      return
    end
    if strlower(arg) == "clear" then
      db.discord = nil
      Print("Discord invite removed.")
    else
      local link = CleanDiscord(arg)
      if not link then
        Print("That is not a Discord invite. It should look like discord.gg/yourcode")
        return
      end
      db.discord = link
      Print("Discord invite saved: " .. link)
    end
    Broadcast(true)
    if frame and frame:IsShown() then RaidNight_Refresh() end
    return
  end
  if msg == "export" then
    BuildUI()
    frame:Show()
    RaidNight_ShowExport()
    return
  end
  if msg == "start" or msg == "share" then
    ShareSheet()
    return
  end
  if msg == "clear" then
    ConfirmClearMine()
    return
  end
  if msg == "clearsheet" or msg == "clear sheet" then
    ConfirmClearSheet()
    return
  end
  if msg == "minimap" then
    db.minimapHidden = not db.minimapHidden
    if SetupMinimapButton then SetupMinimapButton() end
    Print(db.minimapHidden and "Minimap button hidden. Type /rn minimap to bring it back." or "Minimap button shown.")
    return
  end
  if msg == "tour" then
    if StartTour then StartTour(true) end
    return
  end
  if msg == "sound" then
    db.sound = not db.sound
    if db.sound then
      Print("Wisp sound on.")
      PlayWispChime(true)
    else
      Print("Wisp sound off.")
    end
    return
  end
  if msg == "helper" then
    snoozeUntil = 0
    forceHelper = true
    if UpdateHelper then UpdateHelper() end
    forceHelper = false
    if helper and helper:IsShown() then
      Print("Helper's up.")
    else
      Print("Nothing to remind you about right now.")
    end
    return
  end
  if msg == "lock" then
    if not IsLead() then
      Print("Only the party/raid leader can lock SRs.")
      return
    end
    SetLocked(true, true)
    return
  end
  if msg == "unlock" then
    if not IsLead() then
      Print("Only the party/raid leader can unlock SRs.")
      return
    end
    SetLocked(false, true)
    return
  end
  local limit = msg:match("^limit%s+(%d+)$")
  if limit then
    if not IsLead() then
      Print("Only the party/raid leader can change how many reserves each person gets.")
      return
    end
    if db.locked then
      Print("Unlock SRs before changing the reserve count.")
      return
    end
    db.pickLimit = math.max(1, math.min(6, tonumber(limit)))
    local picks = Picks()
    while #picks > db.pickLimit do tremove(picks) end
    Broadcast()
    Print("Reserves set to " .. db.pickLimit .. " each.")
    if frame and frame:IsShown() then RaidNight_Refresh() end
    return
  end
  RaidNight_Toggle()
end
