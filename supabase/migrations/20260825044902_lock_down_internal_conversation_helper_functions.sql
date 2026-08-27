-- Migration: 收紧对话去重内部辅助函数的执行权限
--
-- 为什么改：
--   find_direct_conversation_between / create_direct_conversation_row /
--   get_or_create_direct_conversation / insert_conversation_reference_message
--   这4个函数只应该被 create_direct_conversation / create_activity_conversation /
--   create_profile_conversation 这三个对外入口在内部调用，不应该是可以被
--   客户端直接 .rpc() 调用的公开接口——如果客户端能直接调用，就能绕过
--   三个入口各自的身份校验（比如帖子/活动场景"对方是谁"必须从 post_id/
--   activity_id 服务端解析，不能信任客户端直接传两个任意用户 id 建会话），
--   等于重新打开了"可以拉任意两个用户建私聊"这个口子。
--
--   只 revoke ... from public 不够——Supabase 项目默认会单独把新建函数的
--   execute 权限授予 anon/authenticated 这两个角色，不会因为从 public 收回
--   就跟着收回，必须显式对这两个角色也 revoke。
--
-- 影响哪些函数：
--   只改这4个函数的执行权限，不改函数体本身、不改表结构。
--
-- 是否影响现有数据：
--   不影响。
--
-- 是否需要回滚方案：
--   需要，但不建议执行——回滚会重新打开上面说的权限漏洞。
--   如果确实需要回滚：
--   grant execute on function public.find_direct_conversation_between(uuid, uuid) to anon, authenticated;
--   grant execute on function public.create_direct_conversation_row(uuid, uuid, text) to anon, authenticated;
--   grant execute on function public.get_or_create_direct_conversation(uuid, uuid, text) to anon, authenticated;
--   grant execute on function public.insert_conversation_reference_message(uuid, uuid, text, uuid, uuid) to anon, authenticated;

revoke execute on function public.find_direct_conversation_between(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.create_direct_conversation_row(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.get_or_create_direct_conversation(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.insert_conversation_reference_message(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
