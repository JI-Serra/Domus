begin;
select plan(1);
select ok(true);
select * from finish();
rollback;
